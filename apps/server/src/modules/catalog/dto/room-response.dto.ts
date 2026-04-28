/**
 * Room Response DTO
 *
 * Shape: full room entity
 */

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
  static from(room: any): RoomResponseDto {
    // TODO: Map to response shape
    return {
      room_id: '',
      name: '',
      capacity: 0,
    };
  }
}
