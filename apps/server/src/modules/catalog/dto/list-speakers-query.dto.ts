import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListSpeakersQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListSpeakersQueryDto extends createZodDto(
  ListSpeakersQuerySchema
) {}
