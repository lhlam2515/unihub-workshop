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
    roomId: z.string().uuid().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export class EmergencyUpdateWorkshopDto extends createZodDto(
  EmergencyUpdateWorkshopSchema
) {}
