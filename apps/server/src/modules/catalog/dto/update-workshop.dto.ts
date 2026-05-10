import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateWorkshopSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  speakerId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  seatsTotal: z.number().int().positive().max(1000).optional(),
  price: z.number().min(0).optional(),
});

export class UpdateWorkshopDto extends createZodDto(UpdateWorkshopSchema) {}
