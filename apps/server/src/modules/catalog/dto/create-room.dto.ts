/**
 * Create Room DTO
 *
 * Validate: { name, building?, floor?, capacity, floor_plan_url?, facilities? }
 */

import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(1),
  building: z.string().optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive(),
  floor_plan_url: z.string().url().optional(),
  facilities: z.array(z.string()).optional(),
});

export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;
