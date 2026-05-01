import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/database";
import type { NewNotificationLog, NotificationLog } from "@/database/types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

/**
 * NotificationLogsRepository
 *
 * CRUD operations for notification audit logs.
 * Tracks all notifications sent with status and outcomes.
 */
@Injectable()
export class NotificationLogsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema
  ) {}

  /**
   * Query notification logs with dynamic filters and pagination
   *
   * Filters: status, channel, type, userId, workshopId
   * Uses partial index idx_notif_status for PENDING queries.
   *
   * @param filters - Optional filter criteria
   * @param filters.status - Filter by delivery status
   * @param filters.channel - Filter by channel type
   * @param filters.type - Filter by notification type
   * @param filters.userId - Filter by recipient user
   * @param filters.workshopId - Filter by related workshop
   * @param pagination - Page and limit controls
   * @param pagination.page - Current page (1-indexed)
   * @param pagination.limit - Items per page
   * @returns OkResult with items array and total count, or FailResult (INTERNAL_ERROR)
   */
  async findMany(
    filters: {
      status?: string;
      channel?: string;
      type?: string;
      userId?: string;
      workshopId?: string;
    },
    pagination: { page: number; limit: number }
  ): Promise<Result<{ items: NotificationLog[]; total: number }>> {
    return tryCatch(
      async (): Promise<{
        items: NotificationLog[];
        total: number;
      }> => {
        const conditions: ReturnType<typeof eq>[] = [];

        if (filters.status)
          conditions.push(
            eq(this.schema.notificationLogs.status, filters.status as any)
          );
        if (filters.channel)
          conditions.push(
            eq(this.schema.notificationLogs.channel, filters.channel as any)
          );
        if (filters.type)
          conditions.push(
            eq(this.schema.notificationLogs.type, filters.type as any)
          );
        if (filters.userId)
          conditions.push(
            eq(this.schema.notificationLogs.userId, filters.userId)
          );
        if (filters.workshopId)
          conditions.push(
            eq(this.schema.notificationLogs.workshopId, filters.workshopId)
          );

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const offset = (pagination.page - 1) * pagination.limit;

        const [items, countResult] = await Promise.all([
          this.db
            .select()
            .from(this.schema.notificationLogs)
            .where(where)
            .orderBy(desc(this.schema.notificationLogs.createdAt))
            .limit(pagination.limit)
            .offset(offset),
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(this.schema.notificationLogs)
            .where(where),
        ]);

        return {
          items: items as NotificationLog[],
          total: Number(countResult[0]?.count ?? 0),
        };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieve a single notification log by ID
   *
   * @param id - Notification log UUID
   * @returns OkResult with the log or null, or FailResult (INTERNAL_ERROR)
   */
  async findById(id: string): Promise<Result<NotificationLog | null>> {
    return tryCatch(
      async (): Promise<NotificationLog | null> => {
        const results = await this.db
          .select()
          .from(this.schema.notificationLogs)
          .where(eq(this.schema.notificationLogs.notificationId, id));
        return (results[0] as NotificationLog) ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Insert a new notification log record
   *
   * @param data - New notification log fields
   * @returns OkResult with the inserted record, or FailResult (INTERNAL_ERROR)
   */
  async create(data: NewNotificationLog): Promise<Result<NotificationLog>> {
    return tryCatch(
      async (): Promise<NotificationLog> => {
        const results = await this.db
          .insert(this.schema.notificationLogs)
          .values(data)
          .returning();
        return results[0] as NotificationLog;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Update notification delivery status after an attempt
   *
   * Side effects:
   * - Updates status, sent_at, and error_message columns
   *
   * @param id - Notification log UUID
   * @param status - New delivery status
   * @param sentAt - Timestamp when the notification was sent (SENT only)
   * @param errorMessage - Error detail from a failed delivery attempt
   * @returns OkResult with the updated record, or FailResult (INTERNAL_ERROR)
   */
  async updateStatus(
    id: string,
    status: "PENDING" | "SENT" | "FAILED",
    sentAt?: Date,
    errorMessage?: string
  ): Promise<Result<NotificationLog>> {
    return tryCatch(
      async (): Promise<NotificationLog> => {
        const results = await this.db
          .update(this.schema.notificationLogs)
          .set({
            status,
            sentAt: sentAt ?? null,
            errorMessage: errorMessage ?? null,
          })
          .where(eq(this.schema.notificationLogs.notificationId, id))
          .returning();
        return results[0] as NotificationLog;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
