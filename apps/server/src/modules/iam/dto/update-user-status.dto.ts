/**
 * Update User Status DTO
 *
 * Request: PATCH /admin/users/{id}/status
 * Validate: { status: 'ACTIVE' | 'SUSPENDED' }
 */

import { z } from 'zod';

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type UpdateUserStatusDto = z.infer<typeof UpdateUserStatusSchema>;
