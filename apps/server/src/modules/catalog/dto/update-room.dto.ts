import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

/**
 * Validates partial room update payloads from the BTC.
 *
 * All fields are optional — only provided fields are applied to the existing
 * room record. Field validation rules mirror the creation schema (e.g.,
 * capacity must be positive, floor_plan_url must be a valid URL).
 */
export const UpdateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  building: z.string().optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive().optional(),
  floorPlanUrl: z.string().url().optional(),
  facilities: z.array(z.string()).optional(),
});

/**
 * DTO class inferred from UpdateRoomSchema.
 *
 * Used by the NestJS ZodValidationPipe to validate and transform
 * incoming PUT /admin/rooms/:id request bodies.
 */
export class UpdateRoomDto extends createZodDto(UpdateRoomSchema) {}
