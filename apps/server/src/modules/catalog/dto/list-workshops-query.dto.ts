import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListPublicWorkshopsQuerySchema = z.object({
  day: z.string().optional(),
  hasSeats: z.coerce.boolean().optional(),
  q: z.string().optional(),
  sort: z.string().optional().default("startsAt"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const ListAdminWorkshopsQuerySchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "COMPLETED", "CANCELLED"]).optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const ListWorkshopsQuerySchema = ListPublicWorkshopsQuerySchema.merge(
  ListAdminWorkshopsQuerySchema
);

export type ListPublicWorkshopsQueryInput = z.infer<
  typeof ListPublicWorkshopsQuerySchema
>;
export type ListAdminWorkshopsQueryInput = z.infer<
  typeof ListAdminWorkshopsQuerySchema
>;
export type ListWorkshopsQueryInput = z.infer<typeof ListWorkshopsQuerySchema>;

export class ListPublicWorkshopsQueryDto extends createZodDto(
  ListPublicWorkshopsQuerySchema
) {}

export class ListAdminWorkshopsQueryDto extends createZodDto(
  ListAdminWorkshopsQuerySchema
) {}

export class ListWorkshopsQueryDto extends createZodDto(
  ListWorkshopsQuerySchema
) {}
