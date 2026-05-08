import { z } from "zod";

export const CreateSpeakerSchema = z.object({
  fullName: z.string().min(1, "Họ tên không được để trống").max(200),
  title: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url("URL không hợp lệ").optional().or(z.literal("")),
});

export const UpdateSpeakerSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  title: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url("URL không hợp lệ").optional().or(z.literal("")),
});

export type CreateSpeakerFormData = z.input<typeof CreateSpeakerSchema>;
export type UpdateSpeakerFormData = z.input<typeof UpdateSpeakerSchema>;
