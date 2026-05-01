import { Injectable } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import { notificationErrors } from "../../../shared/response/errors";
import { NotificationLogResponse } from "../dto/notification-response.dto";
import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "../repositories/notification-logs.repository";

import type { UpdateChannelConfigDto } from "../dto/update-channel-config.dto";

/**
 * NotificationsService
 *
 * Manages notification audit logs and channel configuration.
 * Handles read-only audit queries and configuration updates.
 * The actual sending of notifications is handled by NotificationWorker.
 *
 * Business rules:
 * - Channel configs are relatively static and can be cached
 * - Log queries use a partial index on PENDING status for efficiency
 *
 * Side effects:
 * - updateChannelConfig mutates channel_configs.updated_at
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository,
    private readonly channelConfigsRepo: NotificationChannelConfigsRepository
  ) {}

  /**
   * List notification logs with filtering and pagination
   *
   * @param filters - Filter criteria (status, channel, type, userId, workshopId)
   * @param pagination - Page and limit controls
   * @returns OkResult with paginated notification log response items and total count,
   * or FailResult (INTERNAL_ERROR)
   */
  async listLogs(
    filters: {
      status?: string;
      channel?: string;
      type?: string;
      userId?: string;
      workshopId?: string;
    },
    pagination: { page: number; limit: number }
  ): Promise<
    Result<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const result = await this.notificationLogsRepo.findMany(
      filters,
      pagination
    );
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      items: result.data.items.map((log) => NotificationLogResponse.from(log)),
      total: result.data.total,
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  /**
   * Retrieve a single notification log with full details
   *
   * @param id - Notification log UUID
   * @returns OkResult with the notification log response, or FailResult (INTERNAL_ERROR)
   */
  async getLogById(
    id: string
  ): Promise<Result<Record<string, unknown> | null>> {
    const result = await this.notificationLogsRepo.findById(id);
    if (result.isFailure) return Result.fail(result.error);

    if (!result.data) return Result.fail(notificationErrors.logNotFound(id));

    return Result.ok(NotificationLogResponse.from(result.data));
  }

  /**
   * List all channel configurations
   *
   * @returns OkResult with all channel configs, or FailResult (INTERNAL_ERROR)
   */
  async listChannelConfigs(): Promise<Result<unknown[]>> {
    return this.channelConfigsRepo.findAll();
  }

  /**
   * Update a channel configuration
   *
   * @param channelType - Channel type to update
   * @param dto - Update payload with is_active and optional config_json
   * @returns OkResult with the updated config, or FailResult (INTERNAL_ERROR)
   */
  async updateChannelConfig(
    channelType: string,
    dto: UpdateChannelConfigDto
  ): Promise<Result<unknown>> {
    return this.channelConfigsRepo.update(channelType, {
      isActive: dto.is_active,
      configJson: dto.config_json,
    });
  }
}
