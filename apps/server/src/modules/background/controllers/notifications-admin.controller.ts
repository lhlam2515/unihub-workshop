import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import { UserRole } from "@database/types";
import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles } from "@shared/decorators/roles.decorator";
import { Result } from "@shared/response/result";

import { UpdateChannelConfigDto } from "../dto/update-channel-config.dto";
import { NotificationsService } from "../services/notifications.service";

/**
 * NotificationsAdminController
 *
 * Handles notification audit logs and channel configuration endpoints.
 * All endpoints require ORGANIZER role.
 *
 * Endpoints:
 * - GET /admin/notifications/logs — List notification logs
 * - GET /admin/notifications/logs/{id} — Get single log
 * - GET /admin/notifications/channels — List channel configs
 * - PATCH /admin/notifications/channels/{channel_type} — Update channel config
 *
 * TODO: Implement all endpoints
 */
@Controller("/admin/notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER)
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // TODO: Implement GET /logs
  @Get("logs")
  async listLogs(@Query() query: any): Promise<Result<any>> {
    // Call notificationsService.listLogs(filters, pagination)
    // Return paginated list of notification logs
  }

  // TODO: Implement GET /logs/{id}
  @Get("logs/:id")
  async getLogById(@Param("id") id: string): Promise<Result<any>> {
    // Call notificationsService.getLogById(id)
    // Return single notification log with full details
  }

  // TODO: Implement GET /channels
  @Get("channels")
  async listChannelConfigs(): Promise<Result<any>> {
    // Call notificationsService.listChannelConfigs()
    // Return list of notification channel configurations
  }

  // TODO: Implement PATCH /channels/{channel_type}
  @Patch("channels/:channelType")
  @HttpCode(HttpStatus.OK)
  async updateChannelConfig(
    @Param("channelType") channelType: string,
    @Body() dto: UpdateChannelConfigDto
  ): Promise<Result<any>> {
    // Call notificationsService.updateChannelConfig(channelType, dto)
    // Update channel configuration (is_active, config_json)
    // Return updated config
  }
}
