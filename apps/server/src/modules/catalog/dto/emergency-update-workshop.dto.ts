/**
 * Emergency Update Workshop DTO
 *
 * Validate: { room_id?, starts_at?, ends_at? }
 * At least one field must be present
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const EmergencyUpdateWorkshopSchema = z
  .object({
    room_id: z.string().uuid().optional(),
    starts_at: z.date().optional(),
    ends_at: z.date().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export class EmergencyUpdateWorkshopDto extends createZodDto(
  EmergencyUpdateWorkshopSchema
) {}
