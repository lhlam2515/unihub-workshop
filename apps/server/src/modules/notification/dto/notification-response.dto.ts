import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

import type { NotificationLog } from "@/infra/database/types";

export const NotificationLogResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  workshopId: z.string().uuid().optional(),
  eventType: z.string(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]),
  status: z.enum(["PENDING", "SENT", "FAILED", "TIMEOUT"]),
  payload: z.record(z.string(), z.any()),
  sentAt: z.date().optional(),
  errorMsg: z.string().optional(),
  createdAt: z.date(),
});

export type NotificationLogResponseDto = z.infer<
  typeof NotificationLogResponseSchema
>;

export class NotificationLogResponse {
  /**
   * Convert a raw notification log entity to the API response DTO.
   *
   * Strips internal DB fields and maps snake_case DB columns
   * to camelCase when required by the response schema.
   *
   * @param log - Raw notification log entity from the database
   * @returns Response DTO matching NotificationLogResponseSchema
   */
  static from(log: NotificationLog): NotificationLogResponseDto {
    return {
      id: log.notificationId,
      userId: log.userId,
      workshopId: log.workshopId ?? undefined,
      eventType: log.type,
      channel: log.channel,
      status: log.status,
      payload: log.payload as Record<string, any>,
      sentAt: log.sentAt ?? undefined,
      errorMsg: log.errorMessage ?? undefined,
      createdAt: log.createdAt,
    };
  }
}

/**
 * Query DTO for listing notification logs with filters and cursor pagination.
 *
 * All filter fields are optional. Pagination defaults to limit 20.
 */
export const ListNotificationLogsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListNotificationLogsQueryDto extends createZodDto(
  ListNotificationLogsQuerySchema
) {}
