/**
 * Payments Repository
 *
 * Data access layer for the payments table.
 * All methods wrap Drizzle queries in tryCatch to return Result<T, AppError>.
 *
 * Methods:
 * - findByIdempotencyKey: Layer 2 idempotency lookup (DB UNIQUE constraint).
 * - findById: Single payment lookup by primary key.
 * - create: Insert a new payment with optional transaction support.
 * - updateStatus: Update payment status, gateway_txn_id, completed_at.
 * - findMyPayments: Paginated list filtered by student_id (IDOR enforcement).
 * - findPendingOverdue: Payments past their timeout deadline.
 */
import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { Payment, NewPayment } from "@/database/types/transaction.types";
import { lockTimeoutMapper, systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Finds a payment by its idempotency key (Layer 2 guard).
   *
   * @param key - The idempotency key from the X-Idempotency-Key header.
   * @returns OkResult with the Payment entity or null, or FailResult with INTERNAL_ERROR.
   */
  async findByIdempotencyKey(key: string): Promise<Result<Payment | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.payments)
          .where(eq(this.schema.payments.idempotencyKey, key))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds a payment by its primary key.
   *
   * @param id - The payment UUID.
   * @returns OkResult with the Payment entity or null, or FailResult with INTERNAL_ERROR.
   */
  async findById(id: string): Promise<Result<Payment | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.payments)
          .where(eq(this.schema.payments.paymentId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new payment record.
   *
   * Supports optional Drizzle transaction context for use in multi-step
   * operations (e.g., webhook processing).
   *
   * Side effects:
   * - Inserts a row into the payments table.
   *
   * @param data - NewPayment payload (studentId, amount, gateway, idempotencyKey, etc.).
   * @param tx - Optional transaction context. Uses default db if omitted.
   * @returns OkResult with the created Payment entity, or FailResult with INTERNAL_ERROR.
   */
  async create(data: NewPayment, tx?: any): Promise<Result<Payment>> {
    const conn = tx ?? this.db;
    return tryCatch<Payment>(
      async () => {
        const [result] = await conn
          .insert(this.schema.payments)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a payment's status and optional gateway fields.
   *
   * Supports optional transaction context for ACID webhook processing.
   * Automatically sets completed_at when status is SUCCESS, FAILED, or TIMEOUT.
   *
   * Side effects:
   * - Updates a row in the payments table.
   *
   * @param id - The payment UUID.
   * @param status - New status value (SUCCESS, FAILED, TIMEOUT).
   * @param gatewayTxnId - Optional gateway transaction ID to store.
   * @param tx - Optional transaction context.
   * @returns OkResult with the updated Payment entity, or FailResult with INTERNAL_ERROR.
   */
  async updateStatus(
    id: string,
    status: string,
    gatewayTxnId?: string,
    tx?: any
  ): Promise<Result<Payment>> {
    const conn = tx ?? this.db;
    return tryCatch<Payment>(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
        };
        if (gatewayTxnId !== undefined) {
          updateData.gatewayTxnId = gatewayTxnId;
        }
        const terminalStatuses = ["SUCCESS", "FAILED", "TIMEOUT"];
        if (terminalStatuses.includes(status)) {
          updateData.completedAt = new Date();
        }
        const [result] = await conn
          .update(this.schema.payments)
          .set(updateData)
          .where(eq(this.schema.payments.paymentId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Lists payments belonging to a student with pagination.
   *
   * IDOR is enforced by filtering on student_id — the caller must pass
   * the JWT subject, never a value from request params or body.
   * Results are ordered by initiated_at descending (most recent first).
   *
   * @param studentId - The UUID of the student (from JWT, IDOR-enforced).
   * @param pagination - Optional pagination with page (default 1) and limit (default 20).
   * @returns OkResult with { items: Payment[], total: number }, or FailResult with INTERNAL_ERROR.
   */
  async findMyPayments(
    studentId: string,
    pagination?: { page?: number; limit?: number }
  ): Promise<Result<{ items: Payment[]; total: number }>> {
    return tryCatch(
      async () => {
        const page = pagination?.page ?? 1;
        const limit = pagination?.limit ?? 20;
        const offset = (page - 1) * limit;

        const [countResult] = await this.db
          .select({ total: sql<number>`count(*)` })
          .from(this.schema.payments)
          .where(eq(this.schema.payments.studentId, studentId));

        const total = Number(countResult?.total ?? 0);

        const items = await this.db
          .select()
          .from(this.schema.payments)
          .where(eq(this.schema.payments.studentId, studentId))
          .orderBy(desc(this.schema.payments.initiatedAt))
          .limit(limit)
          .offset(offset);

        return { items, total };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Executes a callback within a Drizzle database transaction.
   *
   * All repository methods accept an optional tx parameter — pass the tx
   * from this callback to participate in the same ACID transaction.
   *
   * Side effects:
   * - Opens a database transaction; commits on success, rolls back on thrown error.
   *
   * @param callback - Async function receiving the transaction client.
   * @returns The value returned by the callback.
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  /**
   * Acquires a pessimistic lock (FOR UPDATE NOWAIT) on the workshop_slots row.
   *
   * Used during payment initiation to serialize concurrent payment creation
   * for the same workshop. Fails fast with DB_LOCK_TIMEOUT if the row is
   * already locked by another transaction.
   *
   * Side effects:
   * - Locks the workshop_slots row within the current transaction.
   *
   * @param workshopId - The UUID of the workshop whose slot to lock.
   * @param tx - Required transaction context.
   * @returns OkResult(void) when lock acquired, or FailResult with DB_LOCK_TIMEOUT.
   */
  async lockWorkshopSlot(workshopId: string, tx: any): Promise<Result<void>> {
    return tryCatch(async () => {
      await tx
        .select({ dummy: sql`1` })
        .from(this.schema.workshopSlots)
        .where(eq(this.schema.workshopSlots.workshopId, workshopId))
        .for("update", { noWait: true })
        .limit(1);
    }, lockTimeoutMapper("workshop_slots"));
  }

  /**
   * Finds a payment by idempotency key with FOR UPDATE NOWAIT lock.
   *
   * Used during webhook processing to serialize concurrent webhook calls
   * for the same payment. The lock ensures the second caller sees the
   * updated status after the first completes.
   *
   * Side effects:
   * - Locks the payment row within the current transaction.
   *
   * @param key - The idempotency key to look up.
   * @param tx - Required transaction context.
   * @returns OkResult with Payment or null, or FailResult with DB_LOCK_TIMEOUT.
   */
  async findByIdempotencyKeyWithLock(
    key: string,
    tx: any
  ): Promise<Result<Payment | null>> {
    return tryCatch(async () => {
      const [result] = await tx
        .select()
        .from(this.schema.payments)
        .where(eq(this.schema.payments.idempotencyKey, key))
        .for("update", { noWait: true })
        .limit(1);
      return result ?? null;
    }, lockTimeoutMapper("payments"));
  }

  /**
   * Finds PENDING payments that have exceeded their timeout deadline.
   *
   * Used by the W4 PaymentTimeoutCron background job to identify
   * overdue payments that need to be expired.
   *
   * @returns OkResult with an array of overdue Payment entities, or FailResult with INTERNAL_ERROR.
   */
  async findPendingOverdue(): Promise<Result<Payment[]>> {
    return tryCatch(
      async () => {
        return this.db
          .select()
          .from(this.schema.payments)
          .where(
            and(
              eq(this.schema.payments.status, "PENDING"),
              sql`${this.schema.payments.timeoutAt} < NOW()`
            )
          );
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Counts payments with a given status.
   *
   * @param status - Payment status to filter by.
   * @returns OkResult with the count, or FailResult (INTERNAL_ERROR).
   */
  async countPending(): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(this.schema.payments)
          .where(eq(this.schema.payments.status, "PENDING"));
        return count;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
