/**
 * Workshops Admin Controller
 *
 * Handles BTC-only workshop management endpoints.
 * All endpoints require JWT authentication and BTC role.
 *
 * Endpoints:
 * - GET /admin/workshops — list all workshops (any status)
 * - POST /admin/workshops — create a new workshop
 * - GET /admin/workshops/:id — get admin detail
 * - PATCH /admin/workshops/:id — update a draft workshop
 * - POST /admin/workshops/:workshopId/publish — publish workshop and init Redis counter
 * - PATCH /admin/workshops/:workshopId/emergency-update — emergency update published workshop
 * - POST /admin/workshops/:workshopId/cancel — cancel workshop and cascade void tickets
 * - GET /admin/workshops/:workshopId/stats — get workshop statistics
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { validationError } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { generateETag, parseIfMatch } from "@/shared/utils/etag.utils";
import type { JwtPayload } from "@/types/jwt-payload";

import { CancelWorkshopDto } from "../dto/cancel-workshop.dto";
import { CreateWorkshopDto } from "../dto/create-workshop.dto";
import { EmergencyUpdateWorkshopDto } from "../dto/emergency-update-workshop.dto";
import { ListAdminWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import { WorkshopsService } from "../services/workshops.service";

import type { Response } from "express";

@Controller("admin/workshops")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class WorkshopsAdminController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  private requireIfMatch(ifMatch: string | undefined) {
    if (!ifMatch) {
      return Result.fail(
        validationError([
          {
            field: "If-Match",
            rule: "required",
            message: "If-Match header is required.",
          },
        ])
      );
    }

    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) {
      return Result.fail(
        validationError([
          {
            field: "If-Match",
            rule: "format",
            message: "If-Match header must be a quoted numeric version.",
          },
        ])
      );
    }

    return Result.ok(expectedVersion);
  }

  private setETag(
    response: Response | undefined,
    result: Result<{ version: number }>
  ) {
    if (result.isSuccess) {
      response?.header("ETag", generateETag(result.data.version));
    }
  }

  /**
   * Lists all workshops (any status) for admin management.
   *
   * Route: GET /admin/workshops
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Supports optional filtering by status, with pagination.
   *
   * @param query - Query parameters for filtering (status, page, limit).
   * @returns Paginated list of workshops with admin-level detail fields.
   */
  @Get()
  async listAdmin(@Query() query: ListAdminWorkshopsQueryDto) {
    return this.workshopsService.listAdmin(query);
  }

  /**
   * Creates a new workshop as a DRAFT.
   *
   * Route: POST /admin/workshops
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   *
   * @param body - Workshop creation payload (title, description, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price?).
   * @param user - Authenticated user JWT payload containing the creator's sub.
   * @returns The newly created workshop admin detail DTO.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkshop(
    @Body() dto: CreateWorkshopDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response?: Response
  ) {
    const result = await this.workshopsService.createWorkshop(
      dto,
      user.staffId ?? user.sub
    );
    this.setETag(response, result);
    return result;
  }

  /**
   * Retrieves full admin detail for a single workshop by ID.
   *
   * Route: GET /admin/workshops/:id
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Includes slot counters (confirmed_count, locked_count), creator ID,
   * and workflow status.
   *
   * @param id - The UUID of the workshop.
   * @returns Admin-level workshop detail DTO.
   */
  @Get(":workshopId")
  async getAdminDetail(
    @Param("workshopId") workshopId: string,
    @Res({ passthrough: true }) response?: Response
  ) {
    const result = await this.workshopsService.getAdminDetail(workshopId);
    this.setETag(response, result);
    return result;
  }

  /**
   * Updates a draft workshop.
   *
   * Route: PATCH /admin/workshops/:id
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Only workshops in DRAFT status can be modified. Room time conflicts
   * are re-validated if room or time fields are changed.
   * Uses If-Match header for optimistic locking.
   *
   * @param id - The UUID of the workshop to update.
   * @param body - Partial workshop update payload.
   * @param ifMatch - If-Match header for optimistic locking.
   * @returns The updated workshop admin detail DTO.
   */
  @Patch(":workshopId")
  async updateWorkshop(
    @Param("workshopId") workshopId: string,
    @Body() dto: UpdateWorkshopDto,
    @Headers("if-match") ifMatch?: string,
    @Res({ passthrough: true }) response?: Response
  ) {
    const expectedVersion = this.requireIfMatch(ifMatch);
    if (expectedVersion.isFailure) return expectedVersion;

    const result = await this.workshopsService.updateWorkshop(
      workshopId,
      dto,
      expectedVersion.data
    );
    this.setETag(response, result);
    return result;
  }

  /**
   * Publishes a draft workshop, making it visible and bookable by students.
   *
   * Route: POST /admin/workshops/:workshopId/publish
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Transitions status from DRAFT to PUBLISHED and initializes the Redis
   * seat counter with the workshop's capacity.
   *
   * @param id - The UUID of the workshop to publish.
   * @returns The published workshop admin detail DTO.
   */
  @Post(":workshopId/publish")
  async publishWorkshop(
    @Param("workshopId") workshopId: string,
    @Headers("if-match") ifMatch?: string,
    @Res({ passthrough: true }) response?: Response
  ) {
    const expectedVersion = this.requireIfMatch(ifMatch);
    if (expectedVersion.isFailure) return expectedVersion;

    const result = await this.workshopsService.publishWorkshop(
      workshopId,
      expectedVersion.data
    );
    this.setETag(response, result);
    return result;
  }

  /**
   * Updates scheduling fields of a published workshop without re-publishing.
   *
   * Route: PATCH /admin/workshops/:workshopId/emergency-update
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Allows modifying room, start time, or end time of an already published
   * workshop. Room time conflicts are re-validated against the new schedule.
   *
   * @param id - The UUID of the workshop to update.
   * @param body - Emergency update payload (room_id?, starts_at?, ends_at?).
   * @returns The updated workshop admin detail DTO.
   */
  @Patch(":workshopId/emergency-update")
  async emergencyUpdate(
    @Param("workshopId") workshopId: string,
    @Body() dto: EmergencyUpdateWorkshopDto,
    @Headers("if-match") ifMatch?: string,
    @Res({ passthrough: true }) response?: Response
  ) {
    const expectedVersion = this.requireIfMatch(ifMatch);
    if (expectedVersion.isFailure) return expectedVersion;

    const result = await this.workshopsService.emergencyUpdate(
      workshopId,
      dto,
      expectedVersion.data
    );
    this.setETag(response, result);
    return result;
  }

  /**
   * Cancels a workshop, transitioning it to CANCELLED status.
   *
   * Route: POST /admin/workshops/:workshopId/cancel
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Transitions status to CANCELLED and removes the Redis seat counter
   * if the workshop was previously PUBLISHED.
   *
   * @param id - The UUID of the workshop to cancel.
   * @returns The cancelled workshop admin detail DTO.
   */
  @Post(":workshopId/cancel")
  async cancelWorkshop(
    @Param("workshopId") workshopId: string,
    @Body() dto: CancelWorkshopDto,
    @Headers("if-match") ifMatch?: string,
    @Res({ passthrough: true }) response?: Response
  ) {
    const expectedVersion = this.requireIfMatch(ifMatch);
    if (expectedVersion.isFailure) return expectedVersion;

    const result = await this.workshopsService.cancelWorkshop(
      workshopId,
      dto,
      expectedVersion.data
    );
    this.setETag(response, result);
    return result;
  }

  /**
   * Retrieves real-time statistics for a specific workshop.
   *
   * Route: GET /admin/workshops/:workshopId/stats
   * Security: Requires BTC role (JwtAuthGuard + RolesGuard).
   * Returns confirmed registration count, locked seat count, and remaining
   * available seats sourced from Redis for real-time accuracy.
   *
   * @param id - The UUID of the workshop.
   * @returns Workshop statistics DTO with confirmed_count, locked_count, available_seats, total_capacity.
   */
  @Get(":workshopId/stats")
  async getStats(@Param("workshopId") workshopId: string) {
    return this.workshopsService.getStats(workshopId);
  }
}
