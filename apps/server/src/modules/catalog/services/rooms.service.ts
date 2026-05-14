/**
 * Rooms Service
 *
 * Handles CRUD operations for rooms.
 * Rooms are venues for workshops and are managed by BTC roles.
 */

import { Injectable } from "@nestjs/common";

import type { NewRoom } from "@/infra/database/types/event-core.types";
import { roomErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomResponseBuilder } from "../dto/room-response.dto";
import { RoomsRepository } from "../repositories/rooms.repository";

import type { CreateRoomDto } from "../dto/create-room.dto";
import type { ListRoomsQueryDto } from "../dto/list-rooms-query.dto";
import type { RoomResponseDto } from "../dto/room-response.dto";
import type { UpdateRoomDto } from "../dto/update-room.dto";

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepo: RoomsRepository) {}

  /**
   * Retrieves all rooms ordered by creation date descending.
   *
   * @returns OkResult containing an array of room DTOs with capacity, building, and facility info, or FailResult (INTERNAL_ERROR).
   */
  /**
   * Retrieves a single room by ID.
   *
   * @param id - The UUID of the room.
   * @returns OkResult containing the room DTO, or FailResult (ROOM_NOT_FOUND).
   */
  async getRoomById(id: string): Promise<Result<RoomResponseDto>> {
    const result = await this.roomsRepo.findById(id);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data) return Result.fail(roomErrors.notFound(id));
    return Result.ok(RoomResponseBuilder.from(result.data));
  }

  async listRooms(
    query?: ListRoomsQueryDto
  ): Promise<Result<RoomResponseDto[]>> {
    const result = await this.roomsRepo.findAll(query?.q);
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
    const data: NewRoom = {
      name: dto.name,
      building: dto.building ?? null,
      floor: dto.floor ?? null,
      capacity: dto.capacity,
      floorPlanUrl: dto.floorPlanUrl ?? null,
      facilities: dto.facilities ?? null,
    };
    const result = await this.roomsRepo.create(data);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(RoomResponseBuilder.from(result.data));
  }

  /**
   * Updates an existing room's attributes.
   *
   * Business rules:
   * - All fields are optional — only provided fields are updated.
   * - Facilities are stored as a JSONB record in the database.
   *
   * Side effects:
   * - Executes UPDATE on the rooms table for the given ID.
   *
   * @param id - The UUID of the room to update.
   * @param dto - Partial room update payload with snake_case fields from API.
   * @returns OkResult containing the updated room DTO, or FailResult (ROOM_NOT_FOUND, INTERNAL_ERROR).
   */
  async updateRoom(
    id: string,
    dto: UpdateRoomDto
  ): Promise<Result<RoomResponseDto>> {
    // Verify room exists
    const existing = await this.roomsRepo.findById(id);
    if (existing.isFailure) return Result.fail(existing.error);
    if (!existing.data) return Result.fail(roomErrors.notFound(id));

    // Build update payload from provided fields
    const data: Partial<NewRoom> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.building !== undefined) data.building = dto.building;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.floorPlanUrl !== undefined) data.floorPlanUrl = dto.floorPlanUrl;
    if (dto.facilities !== undefined) {
      data.facilities = dto.facilities;
    }

    const result = await this.roomsRepo.update(id, data);
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(RoomResponseBuilder.from(result.data));
  }
}
