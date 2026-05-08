/**
 * Assign Workshops DTO
 *
 * Request: POST /admin/checkin-staff/{user_id}/assign-workshops
 * Validate: { workshop_ids: string[] (UUIDs) }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const AssignWorkshopsSchema = z.object({
  workshopIds: z.array(z.string().uuid()),
});

export class AssignWorkshopsDto extends createZodDto(AssignWorkshopsSchema) {}
