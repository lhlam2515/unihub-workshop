import { z } from 'zod';

/**
 * TriggerStudentSyncDto
 *
 * Request DTO for triggering student data synchronization.
 *
 * Schema:
 * {
 *   source_file_name: string (path/name of CSV file in Object Storage)
 * }
 *
 * Example:
 * { "source_file_name": "s3://bucket/uploads/students-2024-04-28.csv" }
 *
 * TODO: Define validation rules for file naming/location
 */
export const TriggerStudentSyncSchema = z.object({
  source_file_name: z.string().min(1).max(500),
  // Additional validation:
  // - Must reference valid Object Storage location
  // - File must exist before job starts
  // - Can add: .regex(/\.csv$/, 'Must be CSV file')
  // - Can add: .regex(/students/, 'File must contain "students" in name')
});

export type TriggerStudentSyncDto = z.infer<typeof TriggerStudentSyncSchema>;
