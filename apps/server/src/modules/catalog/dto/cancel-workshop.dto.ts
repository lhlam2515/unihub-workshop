import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CancelWorkshopSchema = z.object({
  reason: z.string().min(5).max(500),
  notifyRegistered: z.boolean().optional().default(true),
});

export class CancelWorkshopDto extends createZodDto(CancelWorkshopSchema) {}
