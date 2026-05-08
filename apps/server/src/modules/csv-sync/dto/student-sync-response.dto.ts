import { z } from "zod";

import type { StudentSyncJob, StudentSyncError } from "@/infra/database/types";

export const StudentSyncJobSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]),
  totalRows: z.number().int().nonnegative(),
  processedRows: z.number().int().nonnegative(),
  failedRows: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  createdAt: z.date(),
});

export type StudentSyncJobDto = z.infer<typeof StudentSyncJobSchema>;

export class StudentSyncJobResponse {
  static from(job: StudentSyncJob): StudentSyncJobDto {
    return {
      jobId: job.jobId,
      status: job.status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED",
      totalRows: job.totalRows ?? 0,
      processedRows: job.processedRows ?? 0,
      failedRows: job.errorRows ?? 0,
      errorCount: job.errorRows ?? 0,
      startedAt: undefined,
      completedAt: job.completedAt ?? undefined,
      createdAt: job.triggeredAt,
    };
  }
}

export const StudentSyncErrorSchema = z.object({
  errorId: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  rawData: z.record(z.string(), z.any()),
  errorReason: z.string(),
  errorDetail: z.string(),
  createdAt: z.date(),
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
      createdAt: error.createdAt,
    };
  }
}
