/**
 * Room Conflict Service
 *
 * Chuyên kiểm tra xung đột phòng:
 * - checkConflict(roomId, startsAt, endsAt, excludeWorkshopId?)
 *
 * Query bảng workshops WHERE room_id = ? AND status = 'PUBLISHED'
 * với time range overlap.
 * Trả WORKSHOP_TIME_CONFLICT nếu bị trùng.
 */

import { Injectable } from "@nestjs/common";

import { WorkshopsRepository } from "../repositories/workshops.repository";

@Injectable()
export class RoomConflictService {
  constructor(private readonly workshopsRepo: WorkshopsRepository) {}

  /**
   * checkConflict(roomId: string, startsAt: Date, endsAt: Date, excludeWorkshopId?: string)
   *
   * TODO: Check if room is available during time range
   * 1. Query workshops with same room_id
   * 2. Check for time range overlap
   * 3. Return error if conflict found
   * 4. Exclude given workshopId (for update case)
   */
  async checkConflict(
    roomId: string,
    startsAt: Date,
    endsAt: Date,
    excludeWorkshopId?: string
  ) {
    // TODO: Implement
  }
}
