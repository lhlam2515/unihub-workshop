import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { DrizzleTransaction } from "@/database/types/drizzle.types";
import type {
  Registration,
  NewRegistration,
} from "@/database/types/transaction.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

export interface RegistrationWithWorkshopTitle extends Registration {
  workshop_title: string;
}

export interface CancelResult {
  cancelledCount: number;
}

@Injectable()
export class RegistrationsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Finds a single registration by its primary key.
   *
   * @param id - The registration UUID.
   * @returns OkResult with the Registration entity, or null if not found.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findById(id: string): Promise<Result<Registration | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.registrations)
          .where(eq(this.schema.registrations.registrationId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds an active (non-cancelled) registration for a student in a workshop.
   *
   * Excludes registrations with CANCELLED status via raw SQL comparison to
   * allow re-registration after cancellation without hitting a unique constraint.
   *
   * @param studentId - The UUID of the student.
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with the Registration entity, or null if no active registration exists.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findByStudentAndWorkshop(
    studentId: string,
    workshopId: string
  ): Promise<Result<Registration | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.registrations)
          .where(
            and(
              eq(this.schema.registrations.studentId, studentId),
              eq(this.schema.registrations.workshopId, workshopId),
              sql`${this.schema.registrations.status} <> 'CANCELLED'`
            )
          )
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new registration record.
   *
   * Side effects:
   * - Inserts a row into the registrations table.
   *
   * @param data - NewRegistration payload with studentId, workshopId, and initial status.
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with the created Registration entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async create(
    data: NewRegistration,
    _tx?: DrizzleTransaction
  ): Promise<Result<Registration>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.registrations)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a registration's status and sets the corresponding timestamp.
   *
   * Automatically sets confirmedAt for CONFIRMED status and cancelledAt for
   * CANCELLED status. Always updates updatedAt to the current time.
   *
   * Side effects:
   * - Updates a row in the registrations table.
   *
   * @param id - The registration UUID.
   * @param status - New status value (CONFIRMED, CANCELLED, etc.).
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with the updated Registration entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async updateStatus(
    id: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<Result<Registration>> {
    const conn = tx ?? this.db;
    return tryCatch(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
          updatedAt: new Date(),
        };

        if (status === "CONFIRMED") {
          updateData.confirmedAt = new Date();
        } else if (status === "CANCELLED") {
          updateData.cancelledAt = new Date();
        }

        const [result] = await conn
          .update(this.schema.registrations)
          .set(updateData)
          .where(eq(this.schema.registrations.registrationId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Lists registrations belonging to a student, with workshop titles.
   *
   * Performs a LEFT JOIN with the workshops table to include the workshop
   * title. Supports optional status filtering and offset-based pagination.
   * Results are ordered by registration date descending.
   *
   * @param studentId - The UUID of the student (IDOR-enforced — never from request body).
   * @param statusFilter - Optional status to filter by (e.g., CONFIRMED, PENDING_PAYMENT).
   * @param pagination - Optional pagination with page (default 1) and limit (default 20).
   * @returns OkResult with { items: RegistrationWithWorkshopTitle[], total: number }.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findMyRegistrations(
    studentId: string,
    statusFilter?: string | null,
    pagination?: { page?: number; limit?: number }
  ): Promise<
    Result<{ items: RegistrationWithWorkshopTitle[]; total: number }>
  > {
    return tryCatch(
      async () => {
        const page = pagination?.page ?? 1;
        const limit = pagination?.limit ?? 20;
        const offset = (page - 1) * limit;

        const conditions = [eq(this.schema.registrations.studentId, studentId)];
        if (statusFilter) {
          conditions.push(
            eq(this.schema.registrations.status, statusFilter as any)
          );
        }

        const [countResult] = await this.db
          .select({ total: sql<number>`count(*)` })
          .from(this.schema.registrations)
          .where(and(...conditions));

        const total = Number(countResult?.total ?? 0);

        const rows = await this.db
          .select({
            registration: this.schema.registrations,
            workshopTitle: this.schema.workshops.title,
          })
          .from(this.schema.registrations)
          .leftJoin(
            this.schema.workshops,
            eq(
              this.schema.registrations.workshopId,
              this.schema.workshops.workshopId
            )
          )
          .where(and(...conditions))
          .orderBy(desc(this.schema.registrations.registeredAt))
          .limit(limit)
          .offset(offset);

        const items: RegistrationWithWorkshopTitle[] = rows.map((row) => ({
          ...row.registration,
          workshop_title: row.workshopTitle ?? "",
        }));

        return { items, total };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Cancels all active registrations for a workshop.
   *
   * Updates only registrations in CONFIRMED or PENDING_PAYMENT status —
   * already-cancelled records are left untouched.
   *
   * Side effects:
   * - Updates multiple rows in the registrations table.
   * - Sets cancelledAt and updatedAt on each affected row.
   *
   * @param workshopId - The UUID of the workshop being cancelled.
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with { cancelledCount: number } — the count of affected rows.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async cancelAllForWorkshop(
    workshopId: string,
    _tx?: DrizzleTransaction
  ): Promise<Result<CancelResult>> {
    return tryCatch(
      async () => {
        const result = await this.db
          .update(this.schema.registrations)
          .set({
            status: "CANCELLED",
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.schema.registrations.workshopId, workshopId),
              inArray(this.schema.registrations.status, [
                "CONFIRMED",
                "PENDING_PAYMENT",
              ])
            )
          )
          .returning();

        return { cancelledCount: result.length };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Counts CONFIRMED registrations for a workshop.
   *
   * @param workshopId - UUID of the workshop.
   * @returns OkResult with the count, or FailResult (INTERNAL_ERROR).
   */
  async countConfirmedByWorkshop(workshopId: string): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(this.schema.registrations)
          .where(
            and(
              eq(this.schema.registrations.workshopId, workshopId),
              eq(this.schema.registrations.status, "CONFIRMED")
            )
          );
        return count;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
