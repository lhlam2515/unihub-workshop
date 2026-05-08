import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CheckinSyncItemSchema = z.object({
  localId: z.string().uuid(),
  qrCode: z.string().uuid(),
  workshopId: z.string().uuid(),
  checkedInAt: z.number().int(),
});

export const CheckinSyncRequestSchema = z.object({
  deviceId: z.string().uuid(),
  items: z.array(CheckinSyncItemSchema).min(1).max(100),
});

export class CheckinSyncRequestDto extends createZodDto(
  CheckinSyncRequestSchema
) {}
