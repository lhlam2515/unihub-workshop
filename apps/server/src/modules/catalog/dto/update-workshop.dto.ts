import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateWorkshopSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  speaker_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  starts_at: z.date().optional(),
  ends_at: z.date().optional(),
  seats_total: z.number().int().positive().optional(),
  price: z.number().min(0).optional(),
});

export class UpdateWorkshopDto extends createZodDto(UpdateWorkshopSchema) {}
