import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateDeviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

export class CreateDeviceTokenDto extends createZodDto(
  CreateDeviceTokenSchema
) {}
