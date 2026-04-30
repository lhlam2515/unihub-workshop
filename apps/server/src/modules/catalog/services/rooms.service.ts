/**
 * Rooms Service
 *
 * Handles CRUD operations for rooms.
 * Rooms are venues for workshops and are managed by ORGANIZER roles.
 */

import { Injectable } from "@nestjs/common";

import type { NewRoom } from "@/database/types/event-core.types";
import { Result } from "@/shared/response/result";

import { RoomResponseBuilder } from "../dto/room-response.dto";
import { RoomsRepository } from "../repositories/rooms.repository";

import type { CreateRoomDto } from "../dto/create-room.dto";
import type { RoomResponseDto } from "../dto/room-response.dto";

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepo: RoomsRepository) {}

  /**
   * Retrieves all rooms ordered by creation date descending.
   *
   * @returns OkResult containing an array of room DTOs with capacity, building, and facility info, or FailResult (INTERNAL_ERROR).
   */
  async listRooms(): Promise<Result<RoomResponseDto[]>> {
    const result = await this.roomsRepo.findAll();
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(result.data.map((r) => RoomResponseBuilder.from(r)));
  }

  /**
   * Creates a new room for hosting workshops.
   *
   * Business rules:
   * - Facilities are stored as a JSONB record in the database (keyed by facility name).
   * - Capacity must be a positive integer (enforced at schema level).
   *
   * Side effects:
   * - Inserts a new record into the rooms table.
   *
   * @param dto - Room creation payload with snake_case fields from API.
   * @returns OkResult containing the created room DTO, or FailResult with INTERNAL_ERROR.
   */
  async createRoom(dto: CreateRoomDto): Promise<Result<RoomResponseDto>> {
    const facilitiesRecord = dto.facilities
      ? Object.fromEntries(dto.facilities.map((f) => [f, true]))
      : null;

    const data: NewRoom = {
      name: dto.name,
      building: dto.building ?? null,
      floor: dto.floor ?? null,
      capacity: dto.capacity,
      floorPlanUrl: dto.floor_plan_url ?? null,
      facilities: facilitiesRecord,
    };
    const result = await this.roomsRepo.create(data);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(RoomResponseBuilder.from(result.data));
  }
}
