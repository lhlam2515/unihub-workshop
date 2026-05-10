import { Injectable } from "@nestjs/common";

import type { DrizzleTransaction } from "@/infra/database/types/drizzle.types";
import type {
  NewWorkshop,
  WorkshopUpdate,
  Workshop,
  Speaker,
  Room,
} from "@/infra/database/types/event-core.types";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import type { CursorPaginationResult } from "@/shared/pagination/cursor-pagination.helper";
import {
  concurrentModification,
  workshopErrors,
} from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomConflictService } from "./room-conflict.service";
import { SeatCounterService } from "./seat-counter.service";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";
import { RoomResponseBuilder } from "../dto/room-response.dto";
import { SpeakerResponseBuilder } from "../dto/speaker-response.dto";
import { WorkshopResponseBuilder } from "../dto/workshop-response.dto";
import { RoomsRepository } from "../repositories/rooms.repository";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";

import type { CancelWorkshopDto } from "../dto/cancel-workshop.dto";
import type { CreateWorkshopDto } from "../dto/create-workshop.dto";
import type { EmergencyUpdateWorkshopDto } from "../dto/emergency-update-workshop.dto";
import type { ListWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import type { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import type {
  WorkshopSummaryDto,
  WorkshopDetailDto,
  WorkshopAdminDetailDto,
} from "../dto/workshop-response.dto";

type WorkshopWithSpeakerRoom = {
  workshops: Workshop;
  speakers: Speaker | null;
  rooms: Room | null;
};

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly workshopsRepo: WorkshopsRepository,
    private readonly roomConflictService: RoomConflictService,
    private readonly seatCounterService: SeatCounterService,
    private readonly speakersRepo: SpeakersRepository,
    private readonly roomsRepo: RoomsRepository,
    private readonly notificationPublisher: WorkshopNotificationPublisher,
    private readonly notificationLogProducer: NotificationLogProducer
  ) {}

  // ---------------------------------------------------------------------------
  // Public Endpoints
  // ---------------------------------------------------------------------------

  async listPublished(
    query: ListWorkshopsQueryDto
  ): Promise<Result<CursorPaginationResult<WorkshopSummaryDto>>> {
    // Convert 'day' (YYYY-MM-DD) to dateFrom/dateTo for repository
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (query.day) {
      const dayStart = new Date(query.day + "T00:00:00+07:00");
      const dayEnd = new Date(query.day + "T23:59:59.999+07:00");
      dateFrom = dayStart;
      dateTo = dayEnd;
    }

    const result = await this.workshopsRepo.findPublished({
      dateFrom,
      dateTo,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });
    if (result.isFailure) return Result.fail(result.error);

    const mapped = await Promise.all(
      result.data.items.map(async (row: WorkshopWithSpeakerRoom) => {
        const availableSeats = await this.seatCounterService.getCachedSeats(
          row.workshops.workshopId
        );
        const speaker = row.speakers
          ? SpeakerResponseBuilder.fromSummary(row.speakers)
          : null;
        const room = row.rooms
          ? RoomResponseBuilder.fromSummary(row.rooms)
          : null;
        return WorkshopResponseBuilder.fromSummary(
          row.workshops,
          speaker,
          room,
          availableSeats
        );
      })
    );

    return Result.ok({
      items: mapped,
      nextCursor: result.data.nextCursor,
      hasMore: result.data.hasMore,
      limit: query.limit,
    });
  }

  /**
   * Returns real-time seat availability for a workshop.
   *
   * @param id - The UUID of the workshop.
   * @returns OkResult with { workshopId, seatsAvailable, asOf }, or FailResult (WORKSHOP_NOT_FOUND).
   */
  async getAvailability(
    id: string
  ): Promise<
    Result<{ workshopId: string; seatsAvailable: number; asOf: string }>
  > {
    const workshop = await this.workshopsRepo.findById(id);
    if (workshop.isFailure) return Result.fail(workshop.error);
    if (!workshop.data) return Result.fail(workshopErrors.notFound(id));

    const availableSeats = await this.seatCounterService.getCachedSeats(id);

    return Result.ok({
      workshopId: id,
      seatsAvailable: availableSeats,
      asOf: new Date().toISOString(),
    });
  }

  async getPublicDetail(id: string): Promise<Result<WorkshopDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "OPEN") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    const availableSeats = await this.seatCounterService.getCachedSeats(id);

    const speaker = workshopRow.speakers
      ? SpeakerResponseBuilder.from(workshopRow.speakers)
      : null;
    const room = workshopRow.rooms
      ? RoomResponseBuilder.from(workshopRow.rooms)
      : null;

    return Result.ok(
      WorkshopResponseBuilder.fromDetail(
        workshop,
        speaker,
        room,
        availableSeats
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  async createWorkshop(
    dto: CreateWorkshopDto,
    userId: string
  ): Promise<Result<WorkshopAdminDetailDto>> {
    if (dto.roomId) {
      const conflictResult = await this.roomConflictService.checkConflict(
        dto.roomId,
        dto.startsAt,
        dto.endsAt
      );
      if (conflictResult.isFailure) return Result.fail(conflictResult.error);
    }

    const workshopData: NewWorkshop = {
      title: dto.title,
      description: dto.description ?? null,
      speakerId: dto.speakerId ?? null,
      roomId: dto.roomId ?? null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      seatsTotal: dto.seatsTotal,
      seatsAvailable: dto.seatsTotal,
      price: dto.price !== undefined ? String(dto.price) : "0",
      status: "DRAFT",
      createdBy: userId,
    };

    const workshopResult = await this.workshopsRepo.create(workshopData);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    const [speakerResult, roomResult] = await Promise.all([
      this.speakersRepo.findById(dto.speakerId ?? ""),
      this.roomsRepo.findById(dto.roomId ?? ""),
    ]);

    const speaker =
      speakerResult.isSuccess && speakerResult.data
        ? SpeakerResponseBuilder.from(speakerResult.data)
        : null;
    const room =
      roomResult.isSuccess && roomResult.data
        ? RoomResponseBuilder.from(roomResult.data)
        : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshopResult.data,
        speaker,
        room,
        dto.seatsTotal
      )
    );
  }

  async updateWorkshop(
    id: string,
    dto: UpdateWorkshopDto,
    expectedVersion: number
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "DRAFT") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    const roomId = dto.roomId ?? workshop.roomId ?? "";
    const startsAt = dto.startsAt ?? workshop.startsAt;
    const endsAt = dto.endsAt ?? workshop.endsAt;

    if (dto.roomId || dto.startsAt || dto.endsAt) {
      const conflictResult = await this.roomConflictService.checkConflict(
        roomId,
        startsAt,
        endsAt,
        id
      );
      if (conflictResult.isFailure) return Result.fail(conflictResult.error);
    }

    const updateData: WorkshopUpdate = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.speakerId !== undefined) updateData.speakerId = dto.speakerId;
    if (dto.roomId !== undefined) updateData.roomId = dto.roomId;
    if (dto.startsAt !== undefined) updateData.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) updateData.endsAt = dto.endsAt;
    if (dto.seatsTotal !== undefined) {
      updateData.seatsTotal = dto.seatsTotal;
    }
    if (dto.price !== undefined) {
      updateData.price = String(dto.price);
    }

    const updateResult = await this.workshopsRepo.update(
      id,
      updateData,
      expectedVersion
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);
    if (!updateResult.data) {
      return Result.fail(
        concurrentModification("Workshop", id, expectedVersion)
      );
    }

    const [speakerResult, roomResult] = await Promise.all([
      this.speakersRepo.findById(workshop.speakerId ?? ""),
      this.roomsRepo.findById(workshop.roomId ?? ""),
    ]);

    const speaker =
      speakerResult.isSuccess && speakerResult.data
        ? SpeakerResponseBuilder.from(speakerResult.data)
        : null;
    const room =
      roomResult.isSuccess && roomResult.data
        ? RoomResponseBuilder.from(roomResult.data)
        : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        speaker,
        room,
        updateResult.data.seatsTotal
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Publishing & Emergency Updates
  // ---------------------------------------------------------------------------

  async publishWorkshop(
    id: string,
    expectedVersion?: number
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (expectedVersion !== undefined && workshop.version !== expectedVersion) {
      return Result.fail(
        concurrentModification("workshop", id, expectedVersion)
      );
    }

    if (workshop.status !== "DRAFT") {
      return Result.fail(
        workshop.status === "OPEN"
          ? workshopErrors.alreadyPublished(id)
          : workshopErrors.notPublished(id, workshop.status)
      );
    }

    const updateResult = await this.workshopsRepo.updateStatus(id, "OPEN");
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    await this.seatCounterService.initialize(id, workshop.seatsTotal);

    const roomResult = await this.roomsRepo.findById(workshop.roomId ?? "");

    const speaker = workshopRow.speakers
      ? SpeakerResponseBuilder.from(workshopRow.speakers)
      : null;
    const room =
      roomResult.isSuccess && roomResult.data
        ? RoomResponseBuilder.from(roomResult.data)
        : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        speaker,
        room,
        workshop.seatsTotal
      )
    );
  }

  /**
   * Applies emergency changes to a published workshop (room, time slot).
   *
   * Business rules:
   * - Workshop must be in OPEN status.
   * - If room or time changes, checks for room conflicts via RoomConflictService.
   * - Uses optimistic locking via expectedVersion.
   *
   * Side effects:
   * - Updates workshop record in the database (room, startsAt, endsAt).
   *
   * @param id - The UUID of the workshop to update.
   * @param dto - Partial fields to override (roomId, startsAt, endsAt).
   * @param expectedVersion - Version expected by the caller (from If-Match header).
   * @returns OkResult with WorkshopAdminDetailDto, or FailResult with codes:
   * - WORKSHOP_NOT_FOUND: Workshop ID does not exist.
   * - WORKSHOP_NOT_PUBLISHED: Workshop is not in OPEN status.
   * - CONCURRENT_MODIFICATION: Version mismatch (optimistic lock).
   */
  async emergencyUpdate(
    id: string,
    dto: EmergencyUpdateWorkshopDto,
    expectedVersion: number
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "OPEN") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    const roomId = dto.roomId ?? workshop.roomId ?? "";
    const startsAt = dto.startsAt ?? workshop.startsAt;
    const endsAt = dto.endsAt ?? workshop.endsAt;

    if (dto.roomId || dto.startsAt || dto.endsAt) {
      const conflictResult = await this.roomConflictService.checkConflict(
        roomId,
        startsAt,
        endsAt,
        id
      );
      if (conflictResult.isFailure) return Result.fail(conflictResult.error);
    }

    const updateData: WorkshopUpdate = {};
    if (dto.roomId !== undefined) updateData.roomId = dto.roomId;
    if (dto.startsAt !== undefined) updateData.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) updateData.endsAt = dto.endsAt;

    const updateResult = await this.workshopsRepo.update(
      id,
      updateData,
      expectedVersion
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);
    if (!updateResult.data) {
      return Result.fail(
        concurrentModification("Workshop", id, expectedVersion)
      );
    }

    const changes: { roomId?: string; startsAt?: Date; endsAt?: Date } = {};
    if (dto.roomId !== undefined) changes.roomId = dto.roomId;
    if (dto.startsAt !== undefined) changes.startsAt = dto.startsAt;
    if (dto.endsAt !== undefined) changes.endsAt = dto.endsAt;
    void this.notificationPublisher.publishEmergencyUpdate(workshop, changes);

    const roomResult = await this.roomsRepo.findById(workshop.roomId ?? "");

    const speaker = workshopRow.speakers
      ? SpeakerResponseBuilder.from(workshopRow.speakers)
      : null;
    const room =
      roomResult.isSuccess && roomResult.data
        ? RoomResponseBuilder.from(roomResult.data)
        : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        speaker,
        room,
        workshop.seatsTotal
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  async cancelWorkshop(
    id: string,
    dto: CancelWorkshopDto,
    expectedVersion?: number
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (expectedVersion !== undefined && workshop.version !== expectedVersion) {
      return Result.fail(
        concurrentModification("workshop", id, expectedVersion)
      );
    }

    if (workshop.status === "CANCELLED") {
      return Result.fail(workshopErrors.cancelled(id));
    }

    const wasOpen = workshop.status === "OPEN";

    const updateResult = await this.workshopsRepo.updateStatus(id, "CANCELLED");
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    if (wasOpen) {
      await this.seatCounterService.delete(id);
    }

    void this.notificationPublisher.publishCancelled(workshop);

    // Create notification log for workshop owner with cancellation reason
    void this.notificationLogProducer.createAndEnqueue({
      userId: workshop.createdBy,
      workshopId: id,
      type: "WORKSHOP_CANCELLED",
      payload: { title: workshop.title, reason: dto.reason },
    });

    const roomResult = await this.roomsRepo.findById(workshop.roomId ?? "");

    const speaker = workshopRow.speakers
      ? SpeakerResponseBuilder.from(workshopRow.speakers)
      : null;
    const room =
      roomResult.isSuccess && roomResult.data
        ? RoomResponseBuilder.from(roomResult.data)
        : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        speaker,
        room,
        workshop.seatsTotal
      )
    );
  }

  async getPublishedById(id: string): Promise<Result<Workshop>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    if (!workshopResult.data) {
      return Result.fail(workshopErrors.notFound(id));
    }

    const workshop = workshopResult.data.workshops;
    if (workshop.status !== "OPEN") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    return Result.ok(workshop);
  }

  // ---------------------------------------------------------------------------
  // Admin Queries
  // ---------------------------------------------------------------------------

  async getAdminDetail(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    const speaker = workshopRow.speakers
      ? SpeakerResponseBuilder.from(workshopRow.speakers)
      : null;
    const room = workshopRow.rooms
      ? RoomResponseBuilder.from(workshopRow.rooms)
      : null;

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshop,
        speaker,
        room,
        workshop.seatsTotal
      )
    );
  }

  async listAdmin(
    query: ListWorkshopsQueryDto
  ): Promise<Result<CursorPaginationResult<WorkshopAdminDetailDto>>> {
    const result = await this.workshopsRepo.listAdmin({
      status: query.status,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });
    if (result.isFailure) return Result.fail(result.error);

    const mapped = result.data.items.map((row: WorkshopWithSpeakerRoom) => {
      const speaker = row.speakers
        ? SpeakerResponseBuilder.from(row.speakers)
        : null;
      const room = row.rooms ? RoomResponseBuilder.from(row.rooms) : null;

      return WorkshopResponseBuilder.fromAdminDetail(
        row.workshops,
        speaker,
        room,
        row.workshops.seatsTotal
      );
    });

    return Result.ok({
      items: mapped,
      nextCursor: result.data.nextCursor,
      hasMore: result.data.hasMore,
      limit: query.limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  async getStats(id: string): Promise<
    Result<{
      confirmed_count: number;
      available_seats: number;
      total_capacity: number;
    }>
  > {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    const availableSeats = await this.seatCounterService.getCachedSeats(id);

    return Result.ok({
      confirmed_count: await this.getConfirmedCount(id),
      available_seats: availableSeats,
      total_capacity: workshop.seatsTotal,
    });
  }

  // ---------------------------------------------------------------------------
  // Cron Jobs
  // ---------------------------------------------------------------------------

  async completePastWorkshops(): Promise<Result<number>> {
    return this.workshopsRepo.completePastOpen();
  }

  async getPublishedWorkshopsBasic(): Promise<
    Result<{ workshopId: string; seatsTotal: number }[]>
  > {
    return this.workshopsRepo.findOpenBasic();
  }

  async decrementSeat(
    workshopId: string,
    expectedVersion: number,
    tx?: DrizzleTransaction
  ): Promise<Result<{ rowsAffected: number; newVersion: number }>> {
    return this.workshopsRepo.decrementSeat(workshopId, expectedVersion, tx);
  }

  async incrementSeat(
    workshopId: string,
    tx?: DrizzleTransaction
  ): Promise<Result<void>> {
    return this.workshopsRepo.incrementSeat(workshopId, tx);
  }

  async getSeatVersion(
    workshopId: string
  ): Promise<Result<{ version: number; seatsAvailable: number } | null>> {
    return this.workshopsRepo.getSeatVersion(workshopId);
  }

  /**
   * Counts confirmed registrations for a workshop, falling back to 0 on failure.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns The confirmed registration count, or 0 if the query fails.
   */
  private async getConfirmedCount(workshopId: string): Promise<number> {
    const result =
      await this.workshopsRepo.countConfirmedRegistrations(workshopId);
    if (result.isFailure) {
      console.warn(
        `[WorkshopsService] Failed to count confirmed registrations for workshop ${workshopId}: ${result.error.message}`
      );
      return 0;
    }
    return result.data;
  }
}
