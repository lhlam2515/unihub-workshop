import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

/**
 * Zod schema for triggering a student data sync job.
 *
 * Validates the file path in Object Storage.
 *
 * @example { "filePath": "s3://bucket/uploads/students-2024-04-28.csv" }
 */
export const TriggerStudentSyncSchema = z.object({
  filePath: z.string().min(1).max(500),
});

/**
 * Request DTO for triggering student data synchronization.
 *
 * Used by the NestJS ZodValidationPipe to validate the request body.
 */
export class TriggerStudentSyncDto extends createZodDto(
  TriggerStudentSyncSchema
) {}

/**
 * Query schema for listing sync jobs with pagination.
 */
export const ListSyncJobsQuerySchema = z.object({
  status: z.enum(["IN_PROGRESS", "SUCCESS", "FAILED"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Query DTO for listing sync jobs with pagination.
 */
export class ListSyncJobsQueryDto extends createZodDto(
  ListSyncJobsQuerySchema
) {}

/**
 * Query schema for listing sync job errors with pagination.
 */
export const ListSyncJobErrorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Query DTO for listing sync job errors with pagination.
 */
export class ListSyncJobErrorsQueryDto extends createZodDto(
  ListSyncJobErrorsQuerySchema
) {}
