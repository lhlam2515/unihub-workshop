/**
 * Room Response DTOs
 *
 * Matches OpenAPI RoomSummary and Room schemas.
 * - RoomSummary: nested in WorkshopListItem
 * - Room: full detail (extends RoomSummary + capacity, facilities, createdAt)
 */

import type { Room } from "@/infra/database/types/event-core.types";

/** Nested in WorkshopListItem — id + name + optional building/floor/floorPlanUrl */
export interface RoomSummaryDto {
  id: string;
  name: string;
  building: string | null;
  floor: number | null;
  floorPlanUrl: string | null;
}

/** Full room detail — extends RoomSummary with capacity, facilities, createdAt */
export interface RoomResponseDto extends RoomSummaryDto {
  capacity: number;
  facilities: Record<string, unknown> | null;
  createdAt: string | null;
}

export class RoomResponseBuilder {
  static fromSummary(room: Room): RoomSummaryDto {
    return {
      id: room.roomId,
      name: room.name,
      building: room.building,
      floor: room.floor,
      floorPlanUrl: room.floorPlanUrl,
    };
  }

  /**
   * Builds a full RoomResponseDto from a database entity.
   *
   * @param room - Raw room entity from the database.
   * @returns RoomResponseDto with API-safe fields.
   */
  static from(room: Room): RoomResponseDto {
    return {
      id: room.roomId,
      name: room.name,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      floorPlanUrl: room.floorPlanUrl,
      facilities: room.facilities ?? null,
      createdAt: room.createdAt ? room.createdAt.toISOString() : null,
    };
  }
}
