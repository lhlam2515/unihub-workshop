/**
 * Create Speaker DTO
 *
 * Validate: { full_name, title?, bio?, avatar_url? }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateSpeakerSchema = z.object({
  fullName: z.string().min(1),
  title: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export class CreateSpeakerDto extends createZodDto(CreateSpeakerSchema) {}
