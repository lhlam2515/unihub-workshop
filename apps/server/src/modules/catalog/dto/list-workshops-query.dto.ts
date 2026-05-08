import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListWorkshopsQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListWorkshopsQueryInput = z.infer<typeof ListWorkshopsQuerySchema>;

export class ListWorkshopsQueryDto extends createZodDto(
  ListWorkshopsQuerySchema
) {}
