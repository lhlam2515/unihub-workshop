import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListWorkshopsQuerySchema = z.object({
  // Public endpoint params
  day: z.string().optional(),
  hasSeats: z.coerce.boolean().optional().default(false),
  sort: z.string().optional().default("startsAt"),
  // Admin endpoint params
  status: z.enum(["DRAFT", "OPEN", "COMPLETED", "CANCELLED"]).optional(),
  q: z.string().optional(),
  // Pagination
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListWorkshopsQueryInput = z.infer<typeof ListWorkshopsQuerySchema>;

export class ListWorkshopsQueryDto extends createZodDto(
  ListWorkshopsQuerySchema
) {}
