import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from "@/infra/database";
import type { NotificationChannelConfig } from "@/infra/database/types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

/**
 * NotificationChannelConfigsRepository
 *
 * CRUD operations for notification channel configurations.
 * Stores channel-specific settings: email SMTP, Telegram bot token, etc.
 *
 * Methods:
 * - findAll() → List all channel configs
 * - findByChannelType(type) → Get single channel config
 * - update(channelType, data) → Update channel config
 *
 * Note: Data is relatively static and can be cached in memory.
 */
@Injectable()
export class NotificationChannelConfigsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieve all channel configurations
   *
   * @returns OkResult with all channel configs, or FailResult (INTERNAL_ERROR)
   */
  async findAll(): Promise<Result<NotificationChannelConfig[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.notificationChannelConfigs) as Promise<
          NotificationChannelConfig[]
        >,
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Find a channel configuration by its type
   *
   * @param channelType - Channel type identifier (EMAIL, TELEGRAM, APP)
   * @returns OkResult with the config or null, or FailResult (INTERNAL_ERROR)
   */
  async findByChannelType(
    channelType: string
  ): Promise<Result<NotificationChannelConfig | null>> {
    return tryCatch(
      async (): Promise<NotificationChannelConfig | null> => {
        const results = await this.db
          .select()
          .from(this.schema.notificationChannelConfigs)
          .where(
            eq(
              this.schema.notificationChannelConfigs.channelType,
              channelType as "APP" | "EMAIL" | "TELEGRAM"
            )
          );
        return (results[0] as NotificationChannelConfig) ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieve all active channel configurations.
   *
   * Used by NotificationLogProducer to resolve which channels
   * to fan-out notifications to when no specific channel is requested.
   *
   * @returns OkResult with active channel configs, or FailResult (INTERNAL_ERROR)
   */
  async findActiveChannels(): Promise<Result<NotificationChannelConfig[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.notificationChannelConfigs)
          .where(
            eq(this.schema.notificationChannelConfigs.isActive, true)
          ) as Promise<NotificationChannelConfig[]>,
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Update a channel configuration
   *
   * Side effects:
   * - Updates is_active, config_json, updated_at columns
   *
   * @param channelType - Channel type to update
   * @param data - Partial update fields
   * @param data.isActive - Whether the channel is active
   * @param data.configJson - Provider-specific configuration
   * @returns OkResult with the updated config, or FailResult (INTERNAL_ERROR)
   */
  async update(
    channelType: string,
    data: {
      isActive?: boolean;
      configJson?: Record<string, unknown>;
    }
  ): Promise<Result<NotificationChannelConfig>> {
    return tryCatch(
      async (): Promise<NotificationChannelConfig> => {
        const results = await this.db
          .update(this.schema.notificationChannelConfigs)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(
            eq(
              this.schema.notificationChannelConfigs.channelType,
              channelType as "APP" | "EMAIL" | "TELEGRAM"
            )
          )
          .returning();
        return results[0] as NotificationChannelConfig;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
