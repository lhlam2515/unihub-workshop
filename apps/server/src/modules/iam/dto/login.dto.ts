/**
 * Login DTO
 *
 * Request: POST /auth/login
 * Validate: { email, password, account_type, student_id?, platform }
 */

import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
    account_type: z.enum(["student", "staff"]),
    student_id: z.string().optional(),
    platform: z.enum(["WEB", "MOBILE"]),
  })
  .refine(
    (data) => data.account_type !== "student" || !!data.student_id,
    {
      message: "student_id is required when account_type is 'student'",
      path: ["student_id"],
    }
  );

export class LoginDto extends createZodDto(LoginSchema) {}
