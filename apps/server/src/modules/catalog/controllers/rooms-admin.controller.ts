/**
 * Rooms Admin Controller
 *
 * Xử lý:
 * - GET /admin/rooms
 * - POST /admin/rooms
 *
 * Yêu cầu role: ORGANIZER
 */

import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

@Controller("admin/rooms")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class RoomsAdminController {
  constructor(private readonly roomsService: any) {}

  /**
   * GET /admin/rooms
   */
  @Get()
  async listRooms() {
    // TODO: Call roomsService.listRooms()
  }

  /**
   * POST /admin/rooms
   * @body { name, building?, floor?, capacity, floor_plan_url?, facilities? }
   */
  @Post()
  async createRoom(@Body() createDto: any) {
    // TODO: Validate with Zod (CreateRoomSchema)
    // TODO: Call roomsService.createRoom(createDto)
  }
}
