/**
 * Refresh Token DTO
 *
 * Request: POST /auth/refresh
 * Body optional: { refresh_token? }
 *
 * Note: Mobile requires refresh_token in body, Web uses cookies/headers
 */

import { z } from 'zod';

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().optional(),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
