import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

/**
 * Validates partial speaker update payloads from the ORGANIZER.
 *
 * All fields are optional — only provided fields are applied to the existing
 * speaker profile. If full_name is provided, it must be at least 1 character;
 * avatar_url must be a valid URL if provided.
 */
export const UpdateSpeakerSchema = z.object({
  full_name: z.string().min(1).optional(),
  title: z.string().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

/**
 * DTO class inferred from UpdateSpeakerSchema.
 *
 * Used by the NestJS ZodValidationPipe to validate and transform
 * incoming PUT /admin/speakers/:id request bodies.
 */
export class UpdateSpeakerDto extends createZodDto(UpdateSpeakerSchema) {}
