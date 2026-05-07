import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateWorkshopSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  speaker_id: z.string().uuid(),
  room_id: z.string().uuid(),
  starts_at: z.date(),
  ends_at: z.date(),
  seats_total: z.number().int().positive(),
  price: z.number().min(0).default(0),
});

export class CreateWorkshopDto extends createZodDto(CreateWorkshopSchema) {}
