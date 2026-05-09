/**
 * Login DTO
 *
 * Request: POST /auth/login
 * Validate: { accountType, password, studentId?, email? }
 *
 * Conditional validation:
 * - accountType = "student" → studentId is required
 * - accountType = "staff"   → email is required
 */

import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const LoginSchema = z
  .object({
    accountType: z.enum(["STUDENT", "STAFF"]),
    password: z.string().min(8),
    studentId: z.string().optional(),
    email: z.string().email().optional(),
  })
  .refine(
    (data) => {
      if (data.accountType === "STUDENT") return !!data.studentId;
      return !!data.email;
    },
    {
      message: "Required field missing for the selected account type",
      path: ["accountType"],
    }
  );

export class LoginDto extends createZodDto(LoginSchema) {}
