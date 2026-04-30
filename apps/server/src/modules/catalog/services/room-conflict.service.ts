/**
 * Room Conflict Service
 *
 * Checks whether a room is already booked during a given time range.
 * Used by WorkshopsService before creating or updating workshops.
 *
 * Business rules:
 * - Only PUBLISHED workshops are considered for conflict detection.
 * - The excludeWorkshopId parameter allows excluding the current workshop
 *   when updating (self-conflict should not block the update).
 */

import { Injectable } from "@nestjs/common";

import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomsRepository } from "../repositories/rooms.repository";

@Injectable()
export class RoomConflictService {
  constructor(private readonly roomsRepo: RoomsRepository) {}

  /**
   * Checks whether a room is available during the specified time range.
   *
   * Business rules:
   * - Overlapping time ranges are detected using PostgreSQL range overlap logic.
   * - Only PUBLISHED workshops are considered as conflicts.
   *
   * @param roomId - The UUID of the room to check.
   * @param startsAt - Proposed start time for the booking.
   * @param endsAt - Proposed end time for the booking.
   * @param excludeWorkshopId - Optional UUID to exclude from conflict check (used during updates).
   * @returns OkResult with void if the room is available, or FailResult with WORKSHOP_TIME_CONFLICT.
   */
  async checkConflict(
    roomId: string,
    startsAt: Date,
    endsAt: Date,
    excludeWorkshopId?: string
  ): Promise<Result<void>> {
    const result = await this.roomsRepo.findConflicting(
      roomId,
      startsAt,
      endsAt
    );
    if (result.isFailure) return Result.fail(result.error);

    const conflicts = result.data;

    // Filter out the excluded workshop for self-conflict prevention during updates
    const filteredConflicts = excludeWorkshopId
      ? conflicts.filter((w) => w.workshopId !== excludeWorkshopId)
      : conflicts;

    if (filteredConflicts && filteredConflicts.length > 0) {
      return Result.fail(
        workshopErrors.roomConflict(
          roomId,
          startsAt.toISOString(),
          endsAt.toISOString()
        )
      );
    }

    return Result.ok();
  }
}
