import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateWorkshopSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  speakerId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  startsAt: z.date().optional(),
  endsAt: z.date().optional(),
  seatsTotal: z.number().int().positive().optional(),
  price: z.number().min(0).optional(),
});

export class UpdateWorkshopDto extends createZodDto(UpdateWorkshopSchema) {}
