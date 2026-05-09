import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateWorkshopSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  speakerId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  seatsTotal: z.number().int().positive().max(1000),
  price: z.number().min(0),
});

export class CreateWorkshopDto extends createZodDto(CreateWorkshopSchema) {}
