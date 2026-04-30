/**
 * Create Speaker DTO
 *
 * Validate: { full_name, title?, bio?, avatar_url? }
 */

import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateSpeakerSchema = z.object({
  full_name: z.string().min(1),
  title: z.string().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

export class CreateSpeakerDto extends createZodDto(CreateSpeakerSchema) {}
