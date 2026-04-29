/**
 * Login DTO
 *
 * Request: POST /auth/login
 * Validate: { email, password, platform: 'WEB' | 'MOBILE' }
 */

import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  platform: z.enum(["WEB", "MOBILE"]),
});

export type LoginDto = z.infer<typeof LoginSchema>;
