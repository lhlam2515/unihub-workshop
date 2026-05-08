import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { WorkshopScopeGuard } from "@/modules/iam/guards/workshop-scope.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";
import { Result } from "@/shared/response/result";

import { CheckinCreateRequestDto } from "../dto/checkin-create-request.dto";
import { CheckinSyncRequestDto } from "../dto/checkin-sync-request.dto";
import { CachedRegistrationBuilder } from "../dto/cached-registration.dto";
import { CheckinService } from "../services/checkin.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { RegistrationsRepository } from "../repositories/registrations.repository";

/**
 * Handles online check-in (scan) and offline sync operations.
 * Path prefix: /checkins
 */
@Controller("checkins")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CHECKIN_STAFF")
export class CheckinController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly offlineSyncService: OfflineSyncService
  ) {}

  /**
   * Single online check-in via QR code scan.
   *
   * POST /checkins
   *
   * @param body - Scan payload with qrCode, workshopId, checkedInAt.
   * @param user - Authenticated CHECKIN_STAFF payload from JWT.
   * @returns CheckinResultDto with checkin details.
   */
  @Post()
  @UseGuards(WorkshopScopeGuard)
  @HttpCode(HttpStatus.CREATED)
  async scanQR(
    @Body() body: CheckinCreateRequestDto,
    @CurrentUser() user: JwtPayload
  ) {
    const result = await this.checkinService.scanQR(
      body.qrCode,
      body.workshopId,
      user.sub,
      body.checkedInAt
    );

    if (result.isFailure) {
      return result;
    }

    return result;
  }

  /**
   * Batch sync offline check-in records from mobile.
   *
   * POST /checkins/sync
   *
   * @param body - Sync payload with deviceId and items array.
   * @param user - Authenticated CHECKIN_STAFF payload from JWT.
   * @returns Per-item sync results array.
   */
  @Post("sync")
  @RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
  @UseGuards(WorkshopScopeGuard)
  @HttpCode(HttpStatus.OK)
  async syncOfflineData(
    @Body() body: CheckinSyncRequestDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.offlineSyncService.processSyncBatch(
      body.items.map((item) => ({
        localId: item.localId,
        qrCode: item.qrCode,
        workshopId: item.workshopId,
        checkedInAt: new Date(item.checkedInAt),
      })),
      user.sub
    );
  }
}

/**
 * Handles pre-load and status endpoints for the checkin module.
 * Path prefix: /checkin
 */
@Controller("checkin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CHECKIN_STAFF")
export class CheckinPreloadController {
  constructor(
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly checkinService: CheckinService
  ) {}

  /**
   * Pre-load registrations for offline cache (mobile).
   *
   * Returns paginated registrations to populate the mobile app's
   * `cached_registrations` SQLite table. Filters to status IN ('PAID', 'CONFIRMED').
   *
   * GET /checkin/workshops/{workshopId}/registrations
   *
   * @param workshopId - UUID of the workshop.
   * @param cursor - Opaque cursor for pagination.
   * @param limit - Page size (default 200, max 500).
   * @param res - Express response object for X-Total-Count header.
   * @returns Paginated list of CachedRegistrationDto with X-Total-Count header.
   */
  @Get("workshops/:id/registrations")
  @UseGuards(WorkshopScopeGuard)
  async preloadRegistrations(
    @Param("id") workshopId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 200, 500) : 200;

    const result = await this.registrationsRepo.findActiveByWorkshopId(
      workshopId,
      { cursor, limit: parsedLimit }
    );

    if (result.isFailure) return Result.fail(result.error);

    res.header("X-Total-Count", String(result.data.total));

    return Result.ok({
      data: result.data.data.map((r) =>
        CachedRegistrationBuilder.from(r as any)
      ),
      pagination: {
        limit: parsedLimit,
        nextCursor: result.data.nextCursor,
        hasMore: result.data.hasMore,
      },
    });
  }

  /**
   * Retrieves real-time check-in statistics for a workshop.
   *
   * GET /checkin/workshops/{workshopId}/status
   *
   * @param workshopId - UUID of the workshop to query.
   * @returns CheckinStatusDto with confirmed/checked-in counts.
   */
  @Get("workshops/:id/status")
  @UseGuards(WorkshopScopeGuard)
  async getWorkshopStatus(@Param("id") workshopId: string) {
    return this.checkinService.getWorkshopCheckinStatus(workshopId);
  }
}
