import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

/**
 * UpdateChannelConfigDto
 *
 * Request DTO for updating notification channel configuration.
 *
 * Schema:
 * {
 *   is_active: boolean,
 *   config_json?: object (provider-specific settings)
 * }
 *
 * Examples:
 * - EMAIL: { is_active: true, config_json: { smtp_host, smtp_port, smtp_user, ... } }
 * - TELEGRAM: { is_active: true, config_json: { bot_token, chat_id? } }
 */
export const UpdateChannelConfigSchema = z.object({
  isActive: z.boolean(),
  configJson: z.record(z.string(), z.any()).optional(),
});

export class UpdateChannelConfigDto extends createZodDto(
  UpdateChannelConfigSchema
) {}

export type UpdateChannelConfigDtoType = z.infer<
  typeof UpdateChannelConfigSchema
>;
