import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/database";
import type { NewStudentSyncJob, StudentSyncJob } from "@/database/types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

/**
 * StudentSyncJobsRepository
 *
 * CRUD operations for student data sync job tracking.
 * Stores status, progress, and metadata for CSV import jobs.
 */
@Injectable()
export class StudentSyncJobsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema
  ) {}

  /**
   * Insert a new sync job record
   *
   * Side effects: Writes a new row to student_sync_jobs.
   *
   * @param data - New sync job fields (source_file_name required, status defaults to RUNNING)
   * @returns OkResult with the inserted job, or FailResult (INTERNAL_ERROR)
   */
  async create(data: NewStudentSyncJob): Promise<Result<StudentSyncJob>> {
    return tryCatch(
      async (): Promise<StudentSyncJob> => {
        const [inserted] = await this.db
          .insert(this.schema.studentSyncJobs)
          .values(data)
          .returning();
        return inserted;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Update sync job status and optional progress counts
   *
   * Business rules:
   * - When status is SUCCESS, PARTIAL_FAILURE, or FAILED, sets completed_at to NOW()
   *
   * Side effects: Updates the student_sync_jobs row identified by id.
   *
   * @param id - Sync job UUID
   * @param status - New status (RUNNING, SUCCESS, PARTIAL_FAILURE, FAILED)
   * @param counts - Optional progress counters (totalRows, processedRows, errorRows)
   * @returns OkResult with the updated job, or FailResult (INTERNAL_ERROR)
   */
  async updateStatus(
    id: string,
    status: "RUNNING" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILED",
    counts?: {
      totalRows?: number;
      processedRows?: number;
      errorRows?: number;
    }
  ): Promise<Result<StudentSyncJob>> {
    return tryCatch(
      async (): Promise<StudentSyncJob> => {
        const isTerminal =
          status === "SUCCESS" ||
          status === "PARTIAL_FAILURE" ||
          status === "FAILED";

        const updates: Record<string, unknown> = { status };

        if (counts) {
          if (counts.totalRows !== undefined)
            updates.totalRows = counts.totalRows;
          if (counts.processedRows !== undefined)
            updates.processedRows = counts.processedRows;
          if (counts.errorRows !== undefined)
            updates.errorRows = counts.errorRows;
        }

        if (isTerminal) {
          updates.completedAt = new Date();
        }

        const [updated] = await this.db
          .update(this.schema.studentSyncJobs)
          .set(updates)
          .where(eq(this.schema.studentSyncJobs.jobId, id))
          .returning();
        return updated;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieve a single sync job by its UUID
   *
   * @param id - Sync job UUID
   * @returns OkResult with the job or null if not found, or FailResult (INTERNAL_ERROR)
   */
  async findById(id: string): Promise<Result<StudentSyncJob | null>> {
    return tryCatch(
      async (): Promise<StudentSyncJob | null> => {
        const results = await this.db
          .select()
          .from(this.schema.studentSyncJobs)
          .where(eq(this.schema.studentSyncJobs.jobId, id));
        return results[0] ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * List sync jobs with pagination, ordered by triggered_at DESC
   *
   * @param pagination - Page and limit controls
   * @param pagination.page - Current page (1-indexed)
   * @param pagination.limit - Items per page (max 100)
   * @returns OkResult with items array and total count, or FailResult (INTERNAL_ERROR)
   */
  async findMany(pagination: {
    page: number;
    limit: number;
  }): Promise<Result<{ items: StudentSyncJob[]; total: number }>> {
    return tryCatch(
      async (): Promise<{ items: StudentSyncJob[]; total: number }> => {
        const offset = (pagination.page - 1) * pagination.limit;

        const [items, countResult] = await Promise.all([
          this.db
            .select()
            .from(this.schema.studentSyncJobs)
            .orderBy(desc(this.schema.studentSyncJobs.triggeredAt))
            .limit(pagination.limit)
            .offset(offset),
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(this.schema.studentSyncJobs),
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
