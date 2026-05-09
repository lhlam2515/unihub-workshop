import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const ListRegistrationsQuerySchema = z.object({
  status: z
    .preprocess(
      (val) => (typeof val === "string" ? val.split(",") : val),
      z.array(z.enum(["PENDING", "CONFIRMED", "PAID", "CANCELLED"])).optional()
    )
    .optional(),
  upcoming: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListRegistrationsQueryDto extends createZodDto(
  ListRegistrationsQuerySchema
) {}
