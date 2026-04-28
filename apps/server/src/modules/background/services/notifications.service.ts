import { Injectable } from '@nestjs/common';
import { Result } from '@shared/response/result';

import { UpdateChannelConfigDto } from '../dto/update-channel-config.dto';
import { NotificationChannelConfigsRepository } from '../repositories/notification-channel-configs.repository';
import { NotificationLogsRepository } from '../repositories/notification-logs.repository';

/**
 * NotificationsService
 *
 * Manages notification audit logs and channel configuration.
 * This service handles read-only audit operations and configuration updates.
 * The actual sending of notifications is handled by NotificationWorker.
 *
 * Methods:
 * - listLogs(filters, pagination) → List notification logs
 * - getLogById(id) → Get single log with full details
 * - listChannelConfigs() → List all channel configurations
 * - updateChannelConfig(channelType, dto) → Update channel config
 *
 * TODO: Implement all methods
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository,
    private readonly channelConfigsRepo: NotificationChannelConfigsRepository
  ) {}

  // TODO: Implement listLogs
  async listLogs(filters: any, pagination: any): Promise<Result<any>> {
    // Query notificationLogsRepo.findMany(filters, pagination)
    // Apply filters: status, channel_type, type, user_id, workshop_id, date_range
    // Return paginated list of notification logs
    // Use index idx_notif_status for PENDING queries
  }

  // TODO: Implement getLogById
  async getLogById(id: string): Promise<Result<any>> {
    // Query notificationLogsRepo.findById(id)
    // Return full log with payload and error details
  }

  // TODO: Implement listChannelConfigs
  async listChannelConfigs(): Promise<Result<any>> {
    // Query notificationChannelConfigsRepo.findAll()
    // Can be cached in memory as data is relatively static
    // Return: [
    //   {
    //     channel_type: 'EMAIL' | 'TELEGRAM',
    //     is_active: boolean,
    //     config_json: object,
    //     updated_at: DateTime
    //   }
    // ]
  }

  // TODO: Implement updateChannelConfig
  async updateChannelConfig(
    channelType: string,
    dto: UpdateChannelConfigDto
  ): Promise<Result<any>> {
    // Validate channelType enum
    // Call notificationChannelConfigsRepo.update(channelType, { is_active, config_json })
    // Clear cache if using memory cache
    // Return updated config
  }
}
