/**
 * Update Workshop DTO
 *
 * All fields optional (partial update)
 * Only applicable when status = DRAFT
 * Refinement similar to CreateWorkshopDto
 */

import { z } from 'zod';

export const UpdateWorkshopSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    speaker_id: z.string().uuid().optional(),
    room_id: z.string().uuid().optional(),
    starts_at: z.date().optional(),
    ends_at: z.date().optional(),
    capacity: z.number().int().positive().optional(),
    is_paid: z.boolean().optional(),
    price: z.number().positive().optional(),
  })
  .partial();

export type UpdateWorkshopDto = z.infer<typeof UpdateWorkshopSchema>;
