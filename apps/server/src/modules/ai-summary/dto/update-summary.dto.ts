import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

const UpdateSummarySchema = z.object({
  text: z.string().min(1, "Summary text cannot be empty"),
});

export class UpdateSummaryDto extends createZodDto(UpdateSummarySchema) {}
