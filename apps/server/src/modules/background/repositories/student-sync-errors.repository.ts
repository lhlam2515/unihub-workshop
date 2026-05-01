import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/database";
import type { NewStudentSyncError, StudentSyncError } from "@/database/types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

/**
 * StudentSyncErrorsRepository
 *
 * CRUD operations for student sync errors.
 * Tracks all errors encountered during CSV import.
 */
@Injectable()
export class StudentSyncErrorsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema
  ) {}

  /**
   * Insert multiple sync error records at once
   *
   * Side effects: Writes new rows to student_sync_errors.
   *
   * @param errors - Array of new sync error fields
   * @returns OkResult with inserted error records, or FailResult (INTERNAL_ERROR)
   */
  async createBatch(
    errors: NewStudentSyncError[]
  ): Promise<Result<StudentSyncError[]>> {
    return tryCatch(
      async (): Promise<StudentSyncError[]> => {
        const inserted = await this.db
          .insert(this.schema.studentSyncErrors)
          .values(errors)
          .returning();
        return inserted;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieve sync errors for a specific job with pagination
   *
   * Results ordered by row_number ASC for sequential reading.
   *
   * @param jobId - Sync job UUID
   * @param pagination - Page and limit controls
   * @param pagination.page - Current page (1-indexed)
   * @param pagination.limit - Items per page (max 100)
   * @returns OkResult with items array and total count, or FailResult (INTERNAL_ERROR)
   */
  async findByJobId(
    jobId: string,
    pagination: { page: number; limit: number }
  ): Promise<Result<{ items: StudentSyncError[]; total: number }>> {
    return tryCatch(
      async (): Promise<{ items: StudentSyncError[]; total: number }> => {
        const offset = (pagination.page - 1) * pagination.limit;

        const [items, countResult] = await Promise.all([
          this.db
            .select()
            .from(this.schema.studentSyncErrors)
            .where(eq(this.schema.studentSyncErrors.jobId, jobId))
            .orderBy(this.schema.studentSyncErrors.rowNumber)
            .limit(pagination.limit)
            .offset(offset),
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(this.schema.studentSyncErrors)
            .where(eq(this.schema.studentSyncErrors.jobId, jobId)),
        ]);

        return {
          items: items,
          total: Number(countResult[0]?.count ?? 0),
        };
      },
      (err) => systemErrors.internal(err)
    );
  }
}
