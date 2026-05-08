import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CheckinCreateSchema = z.object({
  qrCode: z.string().uuid(),
  workshopId: z.string().uuid(),
  checkedInAt: z.coerce.date(),
  clientLocalId: z.string().uuid().optional(),
});

export class CheckinCreateRequestDto extends createZodDto(
  CheckinCreateSchema
) {}
