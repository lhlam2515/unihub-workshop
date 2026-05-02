/**
 * Update User Status DTO
 *
 * Request: PATCH /admin/users/{id}/status
 * Validate: { status: 'ACTIVE' | 'SUSPENDED' }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export class UpdateUserStatusDto extends createZodDto(UpdateUserStatusSchema) {}
