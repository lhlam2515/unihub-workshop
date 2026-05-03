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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { WorkshopScopeGuard } from "@/core/guards/workshop-scope.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { OfflineSyncDto } from "../dto/offline-sync.dto";
import { ScanQRDto } from "../dto/scan-qr.dto";
import { CheckinService } from "../services/checkin.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { TicketService } from "../services/ticket.service";

@Controller("checkin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CHECKIN_STAFF")
export class CheckinController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly offlineSyncService: OfflineSyncService,
    private readonly ticketService: TicketService
  ) {}

  /**
   * Retrieves all active tickets for a workshop for staff pre-load into mobile SQLite cache.
   *
   * @param workshopId - UUID of the workshop (validated against staff's allowed_workshop_ids by WorkshopScopeGuard).
   * @returns List of active TicketResponseDto.
   */
  @Get("workshops/:id/tickets")
  @UseGuards(WorkshopScopeGuard)
  async getWorkshopTickets(@Param("id") workshopId: string) {
    return this.ticketService.preloadActiveTickets(workshopId);
  }

  /**
   * Validates a QR token and records an online check-in.
   *
   * @param body - Validated scan payload (qr_token, workshop_id, device_id?).
   * @param user - Authenticated CHECKIN_STAFF payload from JWT.
   * @returns Checkin record details (checkin_id, checked_in_at).
   */
  @Post("scan")
  @UseGuards(WorkshopScopeGuard)
  @HttpCode(HttpStatus.OK)
  async scanQR(@Body() body: ScanQRDto, @CurrentUser() user: JwtPayload) {
    return this.checkinService.scanQR(
      body.qr_token,
      body.workshop_id,
      user.sub,
      body.device_id
    );
  }

  /**
   * Accepts a batch of offline check-in records and persists them idempotently.
   *
   * @param body - Validated sync payload (workshop_id, items[]).
   * @param user - Authenticated CHECKIN_STAFF payload from JWT.
   * @returns SyncResultDto with counts of synced, skipped, and conflicted records.
   */
  @Post("sync")
  @UseGuards(WorkshopScopeGuard)
  @HttpCode(HttpStatus.OK)
  async syncOfflineData(
    @Body() body: OfflineSyncDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.offlineSyncService.processSyncBatch(
      body.items,
      user.sub,
      body.workshop_id
    );
  }

  /**
   * Retrieves real-time check-in statistics and recent activity for a workshop.
   *
   * @param workshopId - UUID of the workshop to query.
   * @returns CheckinStatusDto with confirmed/checked-in counts and last 20 check-ins.
   */
  @Get("workshops/:id/status")
  @UseGuards(WorkshopScopeGuard)
  async getWorkshopStatus(@Param("id") workshopId: string) {
    return this.checkinService.getWorkshopCheckinStatus(workshopId);
  }
}
