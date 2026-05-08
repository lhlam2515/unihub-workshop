/**
 * IdempotencyKeys Repository
 *
 * Data access layer for the idempotency_keys table.
 * All methods wrap Drizzle queries in tryCatch to return Result<T, AppError>.
 *
 * Methods:
 * - createOrGetExisting: Atomically insert or retrieve the current state.
 * - markCompleted: Transition to COMPLETED with response payload.
 * - markUnresolved: Transition to UNRESOLVED with renewed lock window.
 * - recoverStale: Find IN_PROGRESS records whose lock window has expired.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq, and, sql, lt } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class IdempotencyKeysRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Atomically inserts a new idempotency key or retrieves the existing row.
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING RETURNING * — when a row with
   * the same key_hash already exists, returns an empty result set. The
   * caller must then SELECT the existing row to determine its state.
   *
   * Business rules:
   * - Returns { isNew: true, status: 'IN_PROGRESS' } when the insert succeeds.
   * - Returns the full existing row when the key already exists.
   *
   * Side effects:
   * - Inserts a row into idempotency_keys when the key is new.
   *
   * @param keyHash - SHA-256 hash of the idempotency key.
   * @param resourceType - 'REGISTRATION' or 'PAYMENT'.
   * @returns OkResult with isNew flag and current row state, or FailResult with INTERNAL_ERROR.
   */
  async createOrGetExisting(
    keyHash: string,
    resourceType: string
  ): Promise<
    Result<{
      isNew: boolean;
      status: string;
      responseBody?: unknown;
      statusCode?: number;
    }>
  > {
    return tryCatch(
      async () => {
        // Try insert — returns row if key was new, empty if conflict
        const [inserted] = await this.db
          .insert(this.schema.idempotencyKeys)
          .values({ keyHash, resourceType })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          return {
            isNew: true,
            status: inserted.status,
          };
        }

        // Key already exists — fetch current state
        const [existing] = await this.db
          .select()
          .from(this.schema.idempotencyKeys)
          .where(eq(this.schema.idempotencyKeys.keyHash, keyHash))
          .limit(1);

        if (!existing) {
          // Race condition: row was inserted and deleted between the two queries
          // Treat as new — the caller will re-attempt the insert
          return { isNew: true, status: "IN_PROGRESS" };
        }

        return {
          isNew: false,
          status: existing.status,
          responseBody: existing.responseBody,
          statusCode: existing.statusCode ?? undefined,
        };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Transitions an idempotency key to COMPLETED with the response payload.
   *
   * Only updates rows that are currently IN_PROGRESS to prevent
   * overwriting already-completed or unresolved states.
   *
   * Side effects:
   * - Updates the idempotency_keys row with response body, status code,
   *   and completed timestamp.
   *
   * @param keyHash - SHA-256 hash of the idempotency key.
   * @param responseBody - The response payload to cache for replay.
   * @param statusCode - The HTTP status code to replay.
   * @returns OkResult(void) on success, or FailResult with INTERNAL_ERROR.
   */
  async markCompleted(
    keyHash: string,
    responseBody: unknown,
    statusCode: number
  ): Promise<Result<void>> {
    return tryCatch(
      async () => {
        await this.db
          .update(this.schema.idempotencyKeys)
          .set({
            status: "COMPLETED",
            responseBody: responseBody as Record<string, unknown>,
            statusCode,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(this.schema.idempotencyKeys.keyHash, keyHash),
              eq(this.schema.idempotencyKeys.status, "IN_PROGRESS")
            )
          );
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Transitions an idempotency key to UNRESOLVED with a renewed lock window.
   *
   * Called when the operation failed partway through — marks the key
   * UNRESOLVED so subsequent retries will attempt the operation again
   * (the UNRESOLVED state allows proceeding in the mechanic check).
   *
   * Side effects:
   * - Updates the idempotency_keys row to UNRESOLVED.
   * - Extends locked_until by 30 seconds from now.
   *
   * @param keyHash - SHA-256 hash of the idempotency key.
   * @returns OkResult(void) on success, or FailResult with INTERNAL_ERROR.
   */
  async markUnresolved(keyHash: string): Promise<Result<void>> {
    return tryCatch(
      async () => {
        await this.db
          .update(this.schema.idempotencyKeys)
          .set({
            status: "UNRESOLVED",
            lockedUntil: sql`NOW() + INTERVAL '30 seconds'`,
          })
          .where(eq(this.schema.idempotencyKeys.keyHash, keyHash));
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Deletes COMPLETED idempotency keys older than the TTL that are not
   * referenced by any UNRESOLVED payment record.
   *
   * Keeps keys referenced by UNRESOLVED payments to preserve the
   * FK relationship for manual investigation.
   *
   * Side effects:
   * - Deletes rows from the idempotency_keys table.
   *
   * @param ttlHours - Age threshold in hours (default 24).
   * @returns OkResult with deletedCount, or FailResult with INTERNAL_ERROR.
   */
  async deleteExpiredNonReferenced(
    ttlHours: number = 24
  ): Promise<Result<{ deletedCount: number }>> {
    return tryCatch(
      async () => {
        const cutoff = new Date(Date.now() - ttlHours * 3_600_000);
        const result = await this.db
          .delete(this.schema.idempotencyKeys)
          .where(
            and(
              eq(this.schema.idempotencyKeys.status, "COMPLETED"),
              lt(this.schema.idempotencyKeys.createdAt, cutoff),
              sql`${this.schema.idempotencyKeys.keyHash} NOT IN (SELECT ${this.schema.payments.idempotencyKey} FROM ${this.schema.payments} WHERE ${this.schema.payments.status} = 'UNRESOLVED')`
            )
          )
          .returning({ keyHash: this.schema.idempotencyKeys.keyHash });
        return { deletedCount: result.length };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds stale IN_PROGRESS records whose lock window has expired.
   *
   * These records represent operations that started but never completed
   * (e.g., the worker crashed mid-operation). A background job can
   * use this method to identify keys that need investigation.
   *
   * Side effects:
   * - None (read-only).
   *
   * @returns OkResult with an array of stale key hashes, or FailResult with INTERNAL_ERROR.
   */
  async recoverStale(): Promise<Result<string[]>> {
    return tryCatch(
      async () => {
        const rows = await this.db
          .select({ keyHash: this.schema.idempotencyKeys.keyHash })
          .from(this.schema.idempotencyKeys)
          .where(
            and(
              eq(this.schema.idempotencyKeys.status, "IN_PROGRESS"),
              lt(this.schema.idempotencyKeys.lockedUntil, sql`NOW()`)
            )
          );
        return rows.map((r) => r.keyHash);
      },
      (err) => systemErrors.internal(err)
    );
  }
}
