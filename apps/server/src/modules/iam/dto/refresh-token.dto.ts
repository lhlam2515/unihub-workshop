/**
 * Refresh Token DTO
 *
 * Request: POST /auth/refresh
 * Body optional: { refresh_token? }
 *
 * Note: Mobile requires refresh_token in body, Web uses cookies/headers
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().optional(),
  platform: z.enum(["WEB", "MOBILE"]).optional().default("WEB"),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
