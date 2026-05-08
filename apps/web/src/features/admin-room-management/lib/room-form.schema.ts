import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(1, "Tên phòng không được để trống").max(200),
  building: z.string().max(200).optional(),
  floor: z.coerce.number().int("Tầng phải là số nguyên").optional(),
  capacity: z.coerce.number().int().positive("Sức chứa phải lớn hơn 0"),
  floorPlanUrl: z.string().url("URL không hợp lệ").optional().or(z.literal("")),
});

export const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  building: z.string().max(200).optional(),
  floor: z.coerce.number().int().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  floorPlanUrl: z.string().url("URL không hợp lệ").optional().or(z.literal("")),
});

export type CreateRoomFormData = z.input<typeof CreateRoomSchema>;
export type UpdateRoomFormData = z.input<typeof UpdateRoomSchema>;
