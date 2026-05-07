import { z } from "zod";

export const StudentLoginSchema = z.object({
  accountType: z.literal("student"),
  studentId: z
    .string()
    .min(1, "Vui lòng nhập MSSV")
    .regex(/^\d{8}$/, "MSSV phải có đúng 8 chữ số"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const StaffLoginSchema = z.object({
  accountType: z.literal("staff"),
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const LoginSchema = z.discriminatedUnion("accountType", [
  StudentLoginSchema,
  StaffLoginSchema,
]);

export type LoginInput = z.infer<typeof LoginSchema>;
