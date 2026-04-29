/**
 * Create Workshop DTO
 *
 * Validate:
 * { title, description?, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price? }
 *
 * Refinement: if is_paid = true then price > 0
 */

import { z } from "zod";

export const CreateWorkshopSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    speaker_id: z.string().uuid(),
    room_id: z.string().uuid(),
    starts_at: z.date(),
    ends_at: z.date(),
    capacity: z.number().int().positive(),
    is_paid: z.boolean(),
    price: z.number().positive().optional(),
  })
  .refine((data) => !data.is_paid || data.price, {
    message: "Price is required when is_paid is true",
  });

export type CreateWorkshopDto = z.infer<typeof CreateWorkshopSchema>;
