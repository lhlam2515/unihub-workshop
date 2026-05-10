import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListUsersQuerySchema = z.object({
  q: z.string().optional(),
  role: z.enum(["STUDENT", "BTC", "CHECKIN_STAFF"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
