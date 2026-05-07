/**
 * Workshops Admin Controller
 *
 * Handles ORGANIZER-only workshop management endpoints.
 * All endpoints require JWT authentication and ORGANIZER role.
 *
 * Endpoints:
 * - GET /admin/workshops — list all workshops (any status)
 * - POST /admin/workshops — create a new workshop
 * - GET /admin/workshops/:id — get admin detail
 * - PUT /admin/workshops/:id — update a draft workshop
 * - POST /admin/workshops/:id/publish — publish workshop and init Redis counter
 * - PATCH /admin/workshops/:id/emergency-update — emergency update published workshop
 * - POST /admin/workshops/:id/cancel — cancel workshop and cascade void tickets
 * - GET /admin/workshops/:id/stats — get workshop statistics
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreateWorkshopDto } from "../dto/create-workshop.dto";
import { EmergencyUpdateWorkshopDto } from "../dto/emergency-update-workshop.dto";
import { ListWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import { WorkshopsService } from "../services/workshops.service";

@Controller("admin/workshops")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class WorkshopsAdminController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  /**
   * Lists all workshops (any status) for admin management.
   *
   * Route: GET /admin/workshops
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Supports optional filtering by status, with pagination.
   *
   * @param query - Query parameters for filtering (status, page, limit).
   * @returns Paginated list of workshops with admin-level detail fields.
   */
  @Get()
  async listAdmin(@Query() query: ListWorkshopsQueryDto) {
    return this.workshopsService.listAdmin(query);
  }

  /**
   * Creates a new workshop as a DRAFT.
   *
   * Route: POST /admin/workshops
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   *
   * @param body - Workshop creation payload (title, description, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price?).
   * @param user - Authenticated user JWT payload containing the creator's sub.
   * @returns The newly created workshop admin detail DTO.
   */
  @Post()
  async createWorkshop(
    @Body() dto: CreateWorkshopDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.workshopsService.createWorkshop(dto, user.sub);
  }

  /**
   * Retrieves full admin detail for a single workshop by ID.
   *
   * Route: GET /admin/workshops/:id
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Includes slot counters (confirmed_count, locked_count), creator ID,
   * and workflow status.
   *
   * @param id - The UUID of the workshop.
   * @returns Admin-level workshop detail DTO.
   */
  @Get(":id")
  async getAdminDetail(@Param("id") id: string) {
    return this.workshopsService.getAdminDetail(id);
  }

  /**
   * Updates a draft workshop.
   *
   * Route: PUT /admin/workshops/:id
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Only workshops in DRAFT status can be modified. Room time conflicts
   * are re-validated if room or time fields are changed.
   *
   * @param id - The UUID of the workshop to update.
   * @param body - Partial workshop update payload.
   * @returns The updated workshop admin detail DTO.
   */
  @Put(":id")
  async updateWorkshop(
    @Param("id") id: string,
    @Body() dto: UpdateWorkshopDto
  ) {
    return this.workshopsService.updateWorkshop(id, dto);
  }

  /**
   * Publishes a draft workshop, making it visible and bookable by students.
   *
   * Route: POST /admin/workshops/:id/publish
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Transitions status from DRAFT to PUBLISHED and initializes the Redis
   * seat counter with the workshop's capacity.
   *
   * @param id - The UUID of the workshop to publish.
   * @returns The published workshop admin detail DTO.
   */
  @Post(":id/publish")
  async publishWorkshop(@Param("id") id: string) {
    return this.workshopsService.publishWorkshop(id);
  }

  /**
   * Updates scheduling fields of a published workshop without re-publishing.
   *
   * Route: PATCH /admin/workshops/:id/emergency-update
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Allows modifying room, start time, or end time of an already published
   * workshop. Room time conflicts are re-validated against the new schedule.
   *
   * @param id - The UUID of the workshop to update.
   * @param body - Emergency update payload (room_id?, starts_at?, ends_at?).
   * @returns The updated workshop admin detail DTO.
   */
  @Patch(":id/emergency-update")
  async emergencyUpdate(
    @Param("id") id: string,
    @Body() dto: EmergencyUpdateWorkshopDto
  ) {
    return this.workshopsService.emergencyUpdate(id, dto);
  }

  /**
   * Cancels a workshop, transitioning it to CANCELLED status.
   *
   * Route: POST /admin/workshops/:id/cancel
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Transitions status to CANCELLED and removes the Redis seat counter
   * if the workshop was previously PUBLISHED.
   *
   * @param id - The UUID of the workshop to cancel.
   * @returns The cancelled workshop admin detail DTO.
   */
  @Post(":id/cancel")
  async cancelWorkshop(@Param("id") id: string) {
    return this.workshopsService.cancelWorkshop(id);
  }

  /**
   * Retrieves real-time statistics for a specific workshop.
   *
   * Route: GET /admin/workshops/:id/stats
   * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
   * Returns confirmed registration count, locked seat count, and remaining
   * available seats sourced from Redis for real-time accuracy.
   *
   * @param id - The UUID of the workshop.
   * @returns Workshop statistics DTO with confirmed_count, locked_count, available_seats, total_capacity.
   */
  @Get(":id/stats")
  async getStats(@Param("id") id: string) {
    return this.workshopsService.getStats(id);
  }
}
