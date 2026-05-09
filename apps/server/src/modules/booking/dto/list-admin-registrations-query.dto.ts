import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListAdminRegistrationsQuerySchema = z.object({
  status: z
    .preprocess(
      (val) => (typeof val === "string" ? val.split(",") : val),
      z.array(z.enum(["PENDING", "CONFIRMED", "PAID", "CANCELLED"])).optional()
    )
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListAdminRegistrationsQueryDto extends createZodDto(
  ListAdminRegistrationsQuerySchema
) {}
