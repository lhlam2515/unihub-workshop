import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

import { ListNotificationLogsQueryDto } from "../dto/notification-response.dto";
import { UpdateChannelConfigDto } from "../dto/update-channel-config.dto";
import { NotificationsService } from "../services/notifications.service";

@Controller("/admin/notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * List notification logs with filtering and pagination
   *
   * @param query - Filter and pagination parameters
   * @returns Paginated list of notification logs
   */
  @Get("logs")
  async listLogs(@Query() query: ListNotificationLogsQueryDto) {
    return this.notificationsService.listLogs(
      {
        status: query.status,
        channel: query.channel,
        type: query.type,
        userId: query.userId,
        workshopId: query.workshopId,
      },
      { page: query.page, limit: query.limit }
    );
  }

  /**
   * Get a single notification log by ID
   *
   * @param id - Notification log UUID
   * @returns Full notification log with payload
   */
  @Get("logs/:id")
  async getLogById(@Param("id") id: string) {
    return this.notificationsService.getLogById(id);
  }

  /**
   * List all channel configurations
   *
   * @returns All channel configs with is_active and config_json
   */
  @Get("/admin/notification-channels")
  async listChannelConfigs() {
    return this.notificationsService.listChannelConfigs();
  }

  /**
   * Update a channel configuration
   *
   * @param channelId - Channel type to update
   * @param dto - Update payload
   * @returns Updated channel config
   */
  @Patch("/admin/notification-channels/:channelId")
  async updateChannelConfig(
    @Param("channelId") channelId: string,
    @Body() dto: UpdateChannelConfigDto
  ) {
    return this.notificationsService.updateChannelConfig(channelId, dto);
  }
}
