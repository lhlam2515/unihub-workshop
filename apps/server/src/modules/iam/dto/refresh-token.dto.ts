/**
 * Refresh Token DTO
 *
 * Request: POST /auth/refresh
 * Body optional: { refreshToken? }
 *
 * Note: Mobile sends refreshToken in body; Web sends via HttpOnly cookie.
 * Platform is inferred by the controller based on token source.
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
