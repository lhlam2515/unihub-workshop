import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

import type { NotificationLog } from "@/infra/database/types";

export const NotificationLogResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  eventType: z.string(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]),
  status: z.enum(["SENT", "FAILED", "TIMEOUT"]),
  payload: z.record(z.string(), z.any()),
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
   * Strips internal DB fields (workshopId, sentAt) not exposed in the OpenAPI
   * NotificationLog schema.
   *
   * @param log - Raw notification log entity from the database
   * @returns Response DTO matching NotificationLogResponseSchema
   */
  static from(log: NotificationLog): NotificationLogResponseDto {
    return {
      id: log.notificationId,
      userId: log.userId,
      eventType: log.type,
      channel: log.channel,
      status: log.status as "SENT" | "FAILED" | "TIMEOUT",
      payload: log.payload as Record<string, any>,
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
  status: z.enum(["SENT", "FAILED", "TIMEOUT"]).optional(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class ListNotificationLogsQueryDto extends createZodDto(
  ListNotificationLogsQuerySchema
) {}
