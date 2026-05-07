/**
 * Room Response DTO
 *
 * Shape: full room entity
 */

import type { Room } from "@/infra/database/types/event-core.types";

export interface RoomResponseDto {
  room_id: string;
  name: string;
  building?: string;
  floor?: number;
  capacity: number;
  floor_plan_url?: string;
  facilities?: string[];
}

export class RoomResponseBuilder {
  /**
   * Builds a room response DTO from a database entity.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - roomId -> room_id
   * - building/floor/floorPlanUrl: nullish values converted to undefined for clean JSON
   * - facilities: JSONB record ({ "projector": true, "wifi": true }) converted to a
   *   string array of keys (["projector", "wifi"]). Null facilities -> undefined.
   *
   * @param room - Raw room entity from the database.
   * @returns RoomResponseDto with API-safe fields.
   */
  static from(room: Room): RoomResponseDto {
    const facilitiesRaw = room.facilities;
    const facilities: string[] | undefined = facilitiesRaw
      ? Object.keys(facilitiesRaw)
      : undefined;

    return {
      room_id: room.roomId,
      name: room.name,
      building: room.building ?? undefined,
      floor: room.floor ?? undefined,
      capacity: room.capacity,
      floor_plan_url: room.floorPlanUrl ?? undefined,
      facilities,
    };
  }
}
