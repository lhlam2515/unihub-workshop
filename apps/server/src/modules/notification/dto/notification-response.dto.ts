import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

import type { NotificationLog } from "@/infra/database/types";

export const NotificationLogResponseSchema = z.object({
  notificationId: z.string().uuid(),
  userId: z.string().uuid(),
  workshopId: z.string().uuid().optional(),
  type: z.string(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]),
  status: z.enum(["PENDING", "SENT", "FAILED", "TIMEOUT"]),
  payload: z.record(z.string(), z.any()),
  sentAt: z.date().optional(),
  errorMessage: z.string().optional(),
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
      notificationId: log.notificationId,
      userId: log.userId,
      workshopId: log.workshopId ?? undefined,
      type: log.type,
      channel: log.channel,
      status: log.status,
      payload: log.payload as Record<string, any>,
      sentAt: log.sentAt ?? undefined,
      errorMessage: log.errorMessage ?? undefined,
      createdAt: log.createdAt,
    };
  }
}

/**
 * Query DTO for listing notification logs with filters and pagination.
 *
 * All filter fields are optional. Pagination defaults to page 1, limit 20.
 */
export const ListNotificationLogsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  channel: z.enum(["APP", "EMAIL", "TELEGRAM"]).optional(),
  type: z
    .enum([
      "REGISTRATION_CONFIRMED",
      "REGISTRATION_CANCELLED",
      "WORKSHOP_UPDATED",
      "WORKSHOP_CANCELLED",
      "PAYMENT_SUCCESS",
      "PAYMENT_FAILED",
      "PAYMENT_CONFIRMED_LATE",
      "PAYMENT_FAILED_RECONCILED",
      "CHECKIN_REMINDER",
    ])
    .optional(),
  userId: z.string().uuid().optional(),
  workshopId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class ListNotificationLogsQueryDto extends createZodDto(
  ListNotificationLogsQuerySchema
) {}
