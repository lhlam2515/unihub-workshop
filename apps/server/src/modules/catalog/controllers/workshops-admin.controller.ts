/**
 * Workshops Admin Controller
 *
 * Xử lý toàn bộ admin workshop endpoints:
 * - GET/POST /admin/workshops
 * - GET/PUT /admin/workshops/{id}
 * - POST /admin/workshops/{id}/publish
 * - PATCH /admin/workshops/{id}/emergency-update
 * - POST /admin/workshops/{id}/cancel
 * - GET /admin/workshops/{id}/stats
 *
 * Yêu cầu role: ORGANIZER
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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

@Controller("admin/workshops")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class WorkshopsAdminController {
  constructor(private readonly workshopsService: any) {}

  /**
   * GET /admin/workshops
   * @query page, limit, status
   */
  @Get()
  async listAdmin(@Query() query: any) {
    // TODO: Call workshopsService.listAdmin(query)
  }

  /**
   * POST /admin/workshops
   * @body { title, description?, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price? }
   */
  @Post()
  async createWorkshop(@Body() createDto: any, @CurrentUser() user: any) {
    // TODO: Validate with Zod (CreateWorkshopSchema)
    // TODO: Check room conflicts via RoomConflictService
    // TODO: Call workshopsService.createWorkshop(createDto, user.id)
  }

  /**
   * GET /admin/workshops/{id}
   */
  @Get(":id")
  async getAdminDetail(@Param("id") id: string) {
    // TODO: Call workshopsService.getAdminDetail(id)
  }

  /**
   * PUT /admin/workshops/{id}
   * Update only DRAFT workshops
   */
  @Put(":id")
  async updateWorkshop(@Param("id") id: string, @Body() updateDto: any) {
    // TODO: Validate with Zod (UpdateWorkshopSchema)
    // TODO: Check status = DRAFT
    // TODO: Check room conflicts
    // TODO: Call workshopsService.updateWorkshop(id, updateDto)
  }

  /**
   * POST /admin/workshops/{id}/publish
   * Publish workshop and initialize Redis counter
   */
  @Post(":id/publish")
  async publishWorkshop(@Param("id") id: string) {
    // TODO: Call workshopsService.publishWorkshop(id)
    // TODO: Initialize Redis seat counter: SET seat:available:{id} {capacity}
  }

  /**
   * PATCH /admin/workshops/{id}/emergency-update
   * Update published workshop with conflict check
   */
  @Patch(":id/emergency-update")
  async emergencyUpdate(@Param("id") id: string, @Body() updateDto: any) {
    // TODO: Validate with Zod (EmergencyUpdateWorkshopSchema)
    // TODO: Check room conflicts if room_id changed
    // TODO: Emit event for booking system
    // TODO: Return updated workshop
  }

  /**
   * POST /admin/workshops/{id}/cancel
   * Cancel workshop and cascade void tickets
   */
  @Post(":id/cancel")
  async cancelWorkshop(@Param("id") id: string) {
    // TODO: Call workshopsService.cancelWorkshop(id)
    // TODO: Cascade: void all tickets, cancel pending payments
    // TODO: DELETE Redis counter
  }

  /**
   * GET /admin/workshops/{id}/stats
   */
  @Get(":id/stats")
  async getStats(@Param("id") id: string) {
    // TODO: Call workshopsService.getStats(id)
    // TODO: Return confirmed_count, locked_count, available_seats
  }
}
