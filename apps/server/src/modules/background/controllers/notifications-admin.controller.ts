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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import { NotificationsService } from "../services/notifications.service";

@Controller("/admin/notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("logs")
  async listLogs(@Query() query: any): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get("logs/:id")
  async getLogById(@Param("id") id: string): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get("channels")
  async listChannelConfigs(): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Patch("channels/:channelType")
  @HttpCode(HttpStatus.OK)
  async updateChannelConfig(
    @Param("channelType") channelType: string,
    @Body() dto: any
  ): Promise<Result<any>> {
    throw new Error("Not implemented");
  }
}
