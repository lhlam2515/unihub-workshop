import { z } from "zod";

import type { StudentSyncJob, StudentSyncError } from "@/infra/database/types";

/**
 * Matches OpenAPI ImportLog schema.
 *
 * Field mapping from DB studentSyncJobs:
 *   jobId       → id
 *   triggeredAt → runAt
 *   status      → RUNNING maps to IN_PROGRESS, PARTIAL_FAILURE maps as-is
 *   errorRows   → failedCount
 *   errorLogUrl → errorFileUrl
 */
export const ImportLogSchema = z.object({
  id: z.string().uuid(),
  runAt: z.string().datetime(),
  triggeredBy: z.enum(["CRON", "MANUAL"]),
  status: z.enum(["IN_PROGRESS", "SUCCESS", "PARTIAL_FAILURE", "FAILED"]),
  totalRows: z.number().int().nonnegative().nullable(),
  successCount: z.number().int().nonnegative().nullable(),
  failedCount: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  filePath: z.string().nullable(),
  errorFileUrl: z.string().nullable(),
});

export type ImportLogDto = z.infer<typeof ImportLogSchema>;

/** Backward-compat aliases — prefer ImportLogDto / ImportLogSchema in new code. */
export const StudentSyncJobSchema = ImportLogSchema;
export type StudentSyncJobDto = ImportLogDto;

export class StudentSyncJobResponse {
  /**
   * Maps a StudentSyncJob DB entity to an ImportLogDto matching the OpenAPI ImportLog schema.
   *
   * @param job - Raw student sync job entity from the database.
   * @returns ImportLogDto with spec-compliant field names and status values.
   */
  static from(job: StudentSyncJob): ImportLogDto {
    const errorRows = job.errorRows ?? 0;
    const totalRows = job.totalRows ?? null;
    return {
      id: job.jobId,
      runAt: job.triggeredAt.toISOString(),
      triggeredBy: job.triggeredBy === "CRON" ? "CRON" : "MANUAL",
      status: job.status === "RUNNING" ? "IN_PROGRESS" : job.status,
      totalRows,
      successCount: totalRows !== null ? totalRows - errorRows : null,
      failedCount: errorRows,
      durationMs: job.completedAt
        ? job.completedAt.getTime() - job.triggeredAt.getTime()
        : null,
      filePath: job.sourceFileName ?? null,
      errorFileUrl: job.errorLogUrl ?? null,
    };
  }
}

export const StudentSyncErrorSchema = z.object({
  errorId: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  rawData: z.record(z.string(), z.any()),
  errorReason: z.string(),
  errorDetail: z.string(),
  createdAt: z.string().datetime(),
});

export type StudentSyncErrorDto = z.infer<typeof StudentSyncErrorSchema>;

export class StudentSyncErrorResponse {
  static from(error: StudentSyncError): StudentSyncErrorDto {
    return {
      errorId: error.errorId,
      rowNumber: error.rowNumber,
      rawData: JSON.parse(error.rawData) as Record<string, unknown>,
      errorReason: error.errorReason,
      errorDetail: error.errorDetail ?? "",
      createdAt: error.createdAt.toISOString(),
    };
  }
}
