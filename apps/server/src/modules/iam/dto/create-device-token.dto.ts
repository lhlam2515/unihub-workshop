import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateDeviceTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["IOS", "ANDROID"]),
});

export class CreateDeviceTokenDto extends createZodDto(
  CreateDeviceTokenSchema
) {}
