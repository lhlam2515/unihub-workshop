import { z } from "zod";

export const CreateWorkshopSchema = z
  .object({
    title: z.string().min(3, "Tiêu đề phải có ít nhất 3 ký tự").max(200),
    description: z.string().max(5000).nullable().optional(),
    speakerId: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        "Diễn giả không hợp lệ"
      )
      .nullable()
      .optional(),
    roomId: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        "Phòng không hợp lệ"
      )
      .nullable()
      .optional(),
    startsAt: z.string().min(1, "Vui lòng chọn thời gian bắt đầu"),
    endsAt: z.string().min(1, "Vui lòng chọn thời gian kết thúc"),
    seatsTotal: z.coerce
      .number()
      .int("Số lượng ghế phải là số nguyên")
      .min(1, "Số lượng ghế tối thiểu là 1")
      .max(1000, "Số lượng ghế tối đa là 1000"),
    price: z.coerce.number().min(0, "Giá không được âm"),
    status: z.enum(["DRAFT", "OPEN"]).default("DRAFT"),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "Thời gian kết thúc phải sau thời gian bắt đầu",
    path: ["endsAt"],
  });

export const UpdateWorkshopSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    speakerId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      .nullable()
      .optional(),
    roomId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      .nullable()
      .optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    seatsTotal: z.coerce.number().int().min(1).max(1000).optional(),
    price: z.coerce.number().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return new Date(data.endsAt) > new Date(data.startsAt);
      }
      return true;
    },
    {
      message: "Thời gian kết thúc phải sau thời gian bắt đầu",
      path: ["endsAt"],
    }
  );

export const CancelWorkshopSchema = z.object({
  reason: z
    .string()
    .min(10, "Lý do hủy phải có ít nhất 10 ký tự")
    .max(500, "Lý do hủy tối đa 500 ký tự"),
  notifyRegistered: z.boolean().default(true),
});

export type CreateWorkshopFormData = z.infer<typeof CreateWorkshopSchema>;
export type UpdateWorkshopFormData = z.infer<typeof UpdateWorkshopSchema>;
export type CancelWorkshopFormData = z.infer<typeof CancelWorkshopSchema>;
