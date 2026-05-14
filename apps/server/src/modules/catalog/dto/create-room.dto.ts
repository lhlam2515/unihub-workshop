/**
 * Create Room DTO
 *
 * Validate: { name, building?, floor?, capacity, floor_plan_url?, facilities? }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(100),
  building: z.string().max(100).optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive(),
  floorPlanUrl: z.string().url().optional(),
  facilities: z.record(z.string(), z.unknown()).optional(),
});

export class CreateRoomDto extends createZodDto(CreateRoomSchema) {}
