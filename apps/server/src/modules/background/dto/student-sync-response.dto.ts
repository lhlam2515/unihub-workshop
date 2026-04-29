import { z } from "zod";

import type { StudentSyncJob, StudentSyncError } from "@/database/types";

export const StudentSyncJobSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]),
  total_rows: z.number().int().nonnegative(),
  processed_rows: z.number().int().nonnegative(),
  failed_rows: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  started_at: z.date().optional(),
  completed_at: z.date().optional(),
  created_at: z.date(),
});

export type StudentSyncJobDto = z.infer<typeof StudentSyncJobSchema>;

export class StudentSyncJobResponse {
  static from(job: StudentSyncJob): StudentSyncJobDto {
    return {
      job_id: job.jobId,
      status: job.status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED",
      total_rows: job.totalRows ?? 0,
      processed_rows: job.processedRows ?? 0,
      failed_rows: job.errorRows ?? 0,
      error_count: job.errorRows ?? 0,
      started_at: undefined,
      completed_at: job.completedAt ?? undefined,
      created_at: job.triggeredAt,
    };
  }
}

export const StudentSyncErrorSchema = z.object({
  error_id: z.string().uuid(),
  row_number: z.number().int().positive(),
  raw_data: z.record(z.string(), z.any()),
  error_reason: z.string(),
  error_detail: z.string(),
  created_at: z.date(),
});

export type StudentSyncErrorDto = z.infer<typeof StudentSyncErrorSchema>;

export class StudentSyncErrorResponse {
  static from(error: StudentSyncError): StudentSyncErrorDto {
    return {
      error_id: error.errorId,
      row_number: error.rowNumber,
      raw_data: JSON.parse(error.rawData),
      error_reason: error.errorReason,
      error_detail: error.errorDetail ?? "",
      created_at: error.createdAt,
    };
  }
}
