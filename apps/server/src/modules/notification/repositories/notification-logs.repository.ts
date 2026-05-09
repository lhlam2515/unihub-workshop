import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/infra/database";
import type {
  NewNotificationLog,
  NotificationLog,
} from "@/infra/database/types";
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
   * Query notification logs with dynamic filters and cursor pagination
   *
   * Filters: status, channel, from, to
   * Uses cursor-based pagination on createdAt descending.
   *
   * @param filters - Optional filter criteria
   * @param filters.status - Filter by delivery status
   * @param filters.channel - Filter by channel type
   * @param filters.from - Lower bound for createdAt date range (ISO string)
   * @param filters.to - Upper bound for createdAt date range (ISO string)
   * @param filters.cursor - Base64-encoded cursor from a previous page's last item createdAt
   * @param filters.limit - Max items to return (default 20, capped at 100)
   * @returns OkResult with items array, nextCursor, and hasMore flag, or FailResult (INTERNAL_ERROR)
   */
  async findMany(filters: {
    status?: string;
    channel?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<
    Result<{
      items: NotificationLog[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    return tryCatch(
      async (): Promise<{
        items: NotificationLog[];
        nextCursor: string | null;
        hasMore: boolean;
        limit: number;
      }> => {
        const conditions: ReturnType<typeof eq>[] = [];
        const limit = filters.limit ?? 20;

        if (filters.status)
          conditions.push(
            eq(this.schema.notificationLogs.status, filters.status as any)
          );
        if (filters.channel)
          conditions.push(
            eq(this.schema.notificationLogs.channel, filters.channel as any)
          );

        // Date range filters on createdAt
        if (filters.from) {
          conditions.push(
            gte(this.schema.notificationLogs.createdAt, new Date(filters.from))
          );
        }
        if (filters.to) {
          conditions.push(
            lte(this.schema.notificationLogs.createdAt, new Date(filters.to))
          );
        }

        // Cursor-based pagination on createdAt
        if (filters.cursor) {
          const cursorDate = new Date(
            Buffer.from(filters.cursor, "base64").toString("ascii")
          );
          conditions.push(
            lt(this.schema.notificationLogs.createdAt, cursorDate)
          );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const items = await this.db
          .select()
          .from(this.schema.notificationLogs)
          .where(where)
          .orderBy(desc(this.schema.notificationLogs.createdAt))
          .limit(limit + 1);

        const hasMore = items.length > limit;
        if (hasMore) items.pop();

        const nextCursor =
          items.length > 0
            ? Buffer.from(
                items[items.length - 1].createdAt.toISOString()
              ).toString("base64")
            : null;

        return {
          items: items as NotificationLog[],
          nextCursor,
          hasMore,
          limit,
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
