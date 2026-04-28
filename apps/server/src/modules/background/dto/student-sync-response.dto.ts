import { z } from 'zod';

import type { StudentSyncJob, StudentSyncError } from '@database/types';

/**
 * StudentSyncJobDto
 *
 * Response DTO for student sync job status.
 *
 * Shape:
 * {
 *   job_id: string,
 *   status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
 *   total_rows: number,
 *   processed_rows: number,
 *   failed_rows: number,
 *   error_count: number,
 *   started_at?: DateTime,
 *   completed_at?: DateTime,
 *   created_at: DateTime
 * }
 */
export const StudentSyncJobSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
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
    // TODO: Map database entity to response DTO
    return {
      job_id: job.id,
      status: job.status as 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
      total_rows: job.total_rows,
      processed_rows: job.processed_rows,
      failed_rows: job.failed_rows,
      error_count: job.error_count,
      started_at: job.started_at || undefined,
      completed_at: job.completed_at || undefined,
      created_at: job.created_at,
    };
  }
}

/**
 * StudentSyncErrorDto
 *
 * Response DTO for sync errors.
 *
 * Shape:
 * {
 *   error_id: string,
 *   row_number: number,
 *   raw_data: object (original CSV row),
 *   error_reason: string,
 *   error_detail: string,
 *   created_at: DateTime
 * }
 */
export const StudentSyncErrorSchema = z.object({
  error_id: z.string().uuid(),
  row_number: z.number().int().positive(),
  raw_data: z.record(z.any()),
  error_reason: z.string(),
  error_detail: z.string(),
  created_at: z.date(),
});

export type StudentSyncErrorDto = z.infer<typeof StudentSyncErrorSchema>;

export class StudentSyncErrorResponse {
  static from(error: StudentSyncError): StudentSyncErrorDto {
    // TODO: Map database entity to response DTO
    return {
      error_id: error.id,
      row_number: error.row_number,
      raw_data: error.raw_data,
      error_reason: error.error_reason,
      error_detail: error.error_detail,
      created_at: error.created_at,
    };
  }
}
