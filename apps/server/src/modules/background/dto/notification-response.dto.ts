import { z } from "zod";

import type { NotificationLog } from "@/database/types";

export const NotificationLogResponseSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
  workshop_id: z.string().uuid().optional(),
  type: z.string(),
  channel: z.enum(["EMAIL", "TELEGRAM"]),
  status: z.enum(["PENDING", "SENT", "FAILED"]),
  payload: z.record(z.string(), z.any()),
  sent_at: z.date().optional(),
  error_message: z.string().optional(),
  created_at: z.date(),
});

export type NotificationLogResponseDto = z.infer<
  typeof NotificationLogResponseSchema
>;

export class NotificationLogResponse {
  static from(log: NotificationLog): NotificationLogResponseDto {
    return {
      notification_id: log.notificationId,
      user_id: log.userId,
      workshop_id: log.workshopId ?? undefined,
      type: log.type,
      channel: log.channel as "EMAIL" | "TELEGRAM",
      status: log.status,
      payload: log.payload as Record<string, any>,
      sent_at: log.sentAt ?? undefined,
      error_message: log.errorMessage ?? undefined,
      created_at: log.createdAt,
    };
  }
}
