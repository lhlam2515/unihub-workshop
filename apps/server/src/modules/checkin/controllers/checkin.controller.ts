/**
 * Checkin Controller
 *
 * Xử lý toàn bộ check-in endpoints:
 * - GET /checkin/workshops/{id}/tickets
 * - POST /checkin/scan
 * - POST /checkin/sync (offline sync)
 * - GET /checkin/workshops/{id}/status
 *
 * Tất cả yêu cầu role CHECKIN_STAFF.
 * GET .../tickets và POST /checkin/scan còn yêu cầu @UseGuards(WorkshopScopeGuard).
 */

import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import { WorkshopScopeGuard } from "@core/guards/workshop-scope.guard";
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CurrentUser } from "@shared/decorators/current-user.decorator";
import { Roles } from "@shared/decorators/roles.decorator";

@Controller("checkin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CHECKIN_STAFF")
export class CheckinController {
  constructor(private readonly checkinService: any) {}

  /**
   * GET /checkin/workshops/{id}/tickets
   * Get list of tickets for workshop
   */
  @Get("workshops/:id/tickets")
  @UseGuards(WorkshopScopeGuard)
  async getWorkshopTickets(@Param("id") workshopId: string) {
    // TODO: Call checkinService.getWorkshopTickets(workshopId)
  }

  /**
   * POST /checkin/scan
   * QR code scanning endpoint
   * @body { qr_token, workshop_id, device_id }
   */
  @Post("scan")
  @UseGuards(WorkshopScopeGuard)
  @HttpCode(HttpStatus.OK)
  async scanQR(@Body() scanDto: any, @CurrentUser() user: any) {
    // TODO: Call checkinService.scanQR(scanDto, user.id)
  }

  /**
   * POST /checkin/sync
   * Offline sync - batch process QR codes from mobile app
   * @body { items: [{ qr_token, timestamp }] }
   */
  @Post("sync")
  @HttpCode(HttpStatus.OK)
  async syncOfflineData(@Body() syncDto: any, @CurrentUser() user: any) {
    // TODO: Call offlineSyncService.processSyncBatch(syncDto.items, user.id)
  }

  /**
   * GET /checkin/workshops/{id}/status
   * Get workshop check-in status and stats
   */
  @Get("workshops/:id/status")
  async getWorkshopStatus(@Param("id") workshopId: string) {
    // TODO: Call checkinService.getWorkshopCheckinStatus(workshopId)
  }
}
