import { z } from 'zod';

import type { NotificationLog } from '@database/types';

/**
 * NotificationLogResponseDto
 *
 * Response DTO for notification logs.
 *
 * Shape:
 * {
 *   notification_id: string,
 *   user_id: string,
 *   workshop_id?: string,
 *   type: string (REGISTRATION_CONFIRMED, PAYMENT_SUCCESS, etc.),
 *   channel: string (EMAIL, TELEGRAM),
 *   status: string (PENDING, SENT, FAILED),
 *   payload: object,
 *   sent_at?: DateTime,
 *   error_message?: string,
 *   created_at: DateTime
 * }
 *
 * TODO: Define and implement factory method
 */
export const NotificationLogResponseSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
  workshop_id: z.string().uuid().optional(),
  type: z.string(),
  channel: z.enum(['EMAIL', 'TELEGRAM']),
  status: z.enum(['PENDING', 'SENT', 'FAILED']),
  payload: z.record(z.any()),
  sent_at: z.date().optional(),
  error_message: z.string().optional(),
  created_at: z.date(),
});

export type NotificationLogResponseDto = z.infer<
  typeof NotificationLogResponseSchema
>;

export class NotificationLogResponse {
  static from(log: NotificationLog): NotificationLogResponseDto {
    // TODO: Map database entity to response DTO
    // Filter out internal fields (raw_gateway_response, etc.)
    return {
      notification_id: log.id,
      user_id: log.user_id,
      workshop_id: log.workshop_id || undefined,
      type: log.notification_type,
      channel: log.channel as 'EMAIL' | 'TELEGRAM',
      status: log.status as 'PENDING' | 'SENT' | 'FAILED',
      payload: log.payload,
      sent_at: log.sent_at || undefined,
      error_message: log.error_message || undefined,
      created_at: log.created_at,
    };
  }
}
