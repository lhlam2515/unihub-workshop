import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListWorkshopsQuerySchema = z.object({
  date_from: z.date().optional(),
  date_to: z.date().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(20),
});

export class ListWorkshopsQueryDto extends createZodDto(
  ListWorkshopsQuerySchema
) {}
