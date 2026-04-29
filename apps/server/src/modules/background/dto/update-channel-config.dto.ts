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
 *
 * TODO: Define detailed schemas for each channel provider
 */
export const UpdateChannelConfigSchema = z.object({
  is_active: z.boolean(),
  config_json: z.record(z.any()).optional(),
});

export type UpdateChannelConfigDto = z.infer<typeof UpdateChannelConfigSchema>;

// TODO: Add channel-specific schemas if needed:
// export const EmailChannelConfigSchema = z.object({
//   smtp_host: z.string(),
//   smtp_port: z.number().int(),
//   smtp_user: z.string().email(),
//   smtp_password: z.string(),
//   from_name: z.string(),
//   from_email: z.string().email(),
// });
//
// export const TelegramChannelConfigSchema = z.object({
//   bot_token: z.string(),
//   chat_id: z.string().optional(),
// });
