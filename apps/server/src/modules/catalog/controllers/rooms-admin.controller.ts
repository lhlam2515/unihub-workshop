/**
 * Rooms Admin Controller
 *
 * Handles ORGANIZER-only room management endpoints.
 * All endpoints require JWT authentication and ORGANIZER role.
 *
 * Endpoints:
 * - GET /admin/rooms — list all rooms
 * - POST /admin/rooms — create a new room
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

import { CreateRoomDto } from "../dto/create-room.dto";
import { UpdateRoomDto } from "../dto/update-room.dto";
import { RoomsService } from "../services/rooms.service";

@Controller("admin/rooms")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class RoomsAdminController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Lists all available rooms in the system.
   *
   * Returns all rooms regardless of occupancy status. Room capacity
   * information is included for workshop scheduling validation.
   *
   * Security context: Requires ORGANIZER role.
   *
   * @returns Array of room DTOs.
   */
  @Get()
  async listRooms() {
    return this.roomsService.listRooms();
  }

  /**
   * Creates a new room for hosting workshops.
   *
   * Validates input with CreateRoomSchema before persisting.
   *
   * Security context: Requires ORGANIZER role.
   *
   * @param body - Room creation payload (name, building?, floor?, capacity, floor_plan_url?, facilities?).
   * @returns The newly created room DTO.
   */
  @Post()
  async createRoom(@Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(dto);
  }

  /**
   * Updates an existing room's attributes.
   *
   * Only provided fields are updated; omitted fields retain their existing values.
   *
   * Security context: Requires ORGANIZER role.
   *
   * @param id - The UUID of the room to update.
   * @param body - Partial room update payload.
   * @returns The updated room DTO.
   */
  @Put(":id")
  async updateRoom(@Param("id") id: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.updateRoom(id, dto);
  }
}
