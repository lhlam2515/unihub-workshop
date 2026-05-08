import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateWorkshopSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  speakerId: z.string().uuid(),
  roomId: z.string().uuid(),
  startsAt: z.date(),
  endsAt: z.date(),
  seatsTotal: z.number().int().positive(),
  price: z.number().min(0).default(0),
});

export class CreateWorkshopDto extends createZodDto(CreateWorkshopSchema) {}
