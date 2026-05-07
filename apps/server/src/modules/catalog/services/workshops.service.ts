import { Injectable } from "@nestjs/common";

import type {
  NewWorkshop,
  WorkshopUpdate,
  Workshop,
  Speaker,
  Room,
} from "@/infra/database/types/event-core.types";
import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "@/modules/ai-summary/repositories/workshop-documents.repository";
import { concurrentModification, workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomConflictService } from "./room-conflict.service";
import { SeatCounterService } from "./seat-counter.service";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";
import { WorkshopResponseBuilder } from "../dto/workshop-response.dto";
import { RoomsRepository } from "../repositories/rooms.repository";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";

import type { CreateWorkshopDto } from "../dto/create-workshop.dto";
import type { EmergencyUpdateWorkshopDto } from "../dto/emergency-update-workshop.dto";
import type { ListWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import type { UpdateWorkshopDto } from "../dto/update-workshop.dto";
import type {
  WorkshopSummaryDto,
  WorkshopDetailDto,
  WorkshopAdminDetailDto,
} from "../dto/workshop-response.dto";

type WorkshopWithSpeakerRoom = Workshop & {
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
    private readonly notificationPublisher: WorkshopNotificationPublisher
  ) {}

  // ---------------------------------------------------------------------------
  // Public Endpoints
  // ---------------------------------------------------------------------------

  async listPublished(query: ListWorkshopsQueryDto): Promise<
    Result<{
      items: WorkshopSummaryDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const filters = query as unknown as {
      dateFrom?: Date;
      dateTo?: Date;
      page: number;
      limit: number;
    };
    if (!filters.page) filters.page = 1;
    if (!filters.limit) filters.limit = 20;

    const result = await this.workshopsRepo.findPublished(filters);
    if (result.isFailure) return Result.fail(result.error);

    const { items, total } = result.data;
    const mapped = await Promise.all(
      items.map(async (workshop: WorkshopWithSpeakerRoom) => {
        const availableSeats = await this.seatCounterService.getAvailable(
          workshop.workshopId
        );
        return WorkshopResponseBuilder.fromSummary(
          workshop,
          workshop.speakers?.fullName ?? "Unknown",
          availableSeats
        );
      })
    );

    return Result.ok({
      items: mapped,
      total,
      page: filters.page,
      limit: filters.limit,
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

    const availableSeats = await this.seatCounterService.getAvailable(id);

    return Result.ok(
      WorkshopResponseBuilder.fromDetail(
        workshop,
        workshopRow.speakers?.fullName ?? "Unknown",
        workshopRow.rooms?.name ?? "Unknown",
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
    const conflictResult = await this.roomConflictService.checkConflict(
      dto.room_id,
      dto.starts_at,
      dto.ends_at
    );
    if (conflictResult.isFailure) return Result.fail(conflictResult.error);

    const workshopData: NewWorkshop = {
      title: dto.title,
      description: dto.description ?? null,
      speakerId: dto.speaker_id,
      roomId: dto.room_id,
      startsAt: dto.starts_at,
      endsAt: dto.ends_at,
      seatsTotal: dto.seats_total,
      seatsAvailable: dto.seats_total,
      price: dto.price !== undefined ? String(dto.price) : "0",
      status: "DRAFT",
      createdBy: userId,
    };

    const workshopResult = await this.workshopsRepo.create(workshopData);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    const [speakerResult, roomResult] = await Promise.all([
      this.speakersRepo.findById(dto.speaker_id),
      this.roomsRepo.findById(dto.room_id),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshopResult.data,
        speakerResult.isSuccess && speakerResult.data
          ? speakerResult.data.fullName
          : "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        dto.seats_total
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

    const roomId = dto.room_id ?? workshop.roomId ?? "";
    const startsAt = dto.starts_at ?? workshop.startsAt;
    const endsAt = dto.ends_at ?? workshop.endsAt;

    if (dto.room_id || dto.starts_at || dto.ends_at) {
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
    if (dto.speaker_id !== undefined) updateData.speakerId = dto.speaker_id;
    if (dto.room_id !== undefined) updateData.roomId = dto.room_id;
    if (dto.starts_at !== undefined) updateData.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) updateData.endsAt = dto.ends_at;
    if (dto.seats_total !== undefined) {
      updateData.seatsTotal = dto.seats_total;
    }
    if (dto.price !== undefined) {
      updateData.price = String(dto.price);
    }

    const updateResult = await this.workshopsRepo.update(id, updateData, expectedVersion);
    if (updateResult.isFailure) return Result.fail(updateResult.error);
    if (!updateResult.data) {
      return Result.fail(concurrentModification("Workshop", id, expectedVersion));
    }

    const [speakerResult, roomResult] = await Promise.all([
      this.speakersRepo.findById(workshop.speakerId ?? ""),
      this.roomsRepo.findById(workshop.roomId ?? ""),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        speakerResult.isSuccess && speakerResult.data
          ? speakerResult.data.fullName
          : "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        updateResult.data.seatsTotal
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Publishing & Emergency Updates
  // ---------------------------------------------------------------------------

  async publishWorkshop(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

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

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        workshop.seatsTotal
      )
    );
  }

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

    const roomId = dto.room_id ?? workshop.roomId ?? "";
    const startsAt = dto.starts_at ?? workshop.startsAt;
    const endsAt = dto.ends_at ?? workshop.endsAt;

    if (dto.room_id || dto.starts_at || dto.ends_at) {
      const conflictResult = await this.roomConflictService.checkConflict(
        roomId,
        startsAt,
        endsAt,
        id
      );
      if (conflictResult.isFailure) return Result.fail(conflictResult.error);
    }

    const updateData: WorkshopUpdate = {};
    if (dto.room_id !== undefined) updateData.roomId = dto.room_id;
    if (dto.starts_at !== undefined) updateData.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) updateData.endsAt = dto.ends_at;

    const updateResult = await this.workshopsRepo.update(id, updateData, expectedVersion);
    if (updateResult.isFailure) return Result.fail(updateResult.error);
    if (!updateResult.data) {
      return Result.fail(concurrentModification("Workshop", id, expectedVersion));
    }

    const changes: { roomId?: string; startsAt?: Date; endsAt?: Date } = {};
    if (dto.room_id !== undefined) changes.roomId = dto.room_id;
    if (dto.starts_at !== undefined) changes.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) changes.endsAt = dto.ends_at;
    void this.notificationPublisher.publishEmergencyUpdate(workshop, changes);

    const roomResult = await this.roomsRepo.findById(workshop.roomId ?? "");

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        workshop.seatsTotal
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  async cancelWorkshop(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

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

    const roomResult = await this.roomsRepo.findById(workshop.roomId ?? "");

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
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

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshop,
        workshopRow.speakers?.fullName ?? "Unknown",
        workshopRow.rooms?.name ?? "Unknown",
        workshop.seatsTotal
      )
    );
  }

  async listAdmin(query: ListWorkshopsQueryDto): Promise<
    Result<{
      items: WorkshopAdminDetailDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const filters = query as unknown as {
      status?: import("@/infra/database/types/enums.types").WorkshopStatus;
      page: number;
      limit: number;
    };
    if (!filters.page) filters.page = 1;
    if (!filters.limit) filters.limit = 20;

    const result = await this.workshopsRepo.listAdmin(filters);
    if (result.isFailure) return Result.fail(result.error);

    const { items, total } = result.data;
    const mapped = items.map((workshop: any) =>
      WorkshopResponseBuilder.fromAdminDetail(
        workshop,
        workshop.speakers?.fullName ?? "Unknown",
        workshop.rooms?.name ?? "Unknown",
        workshop.workshops?.seatsTotal ?? workshop.seatsTotal
      )
    );

    return Result.ok({
      items: mapped,
      total,
      page: filters.page,
      limit: filters.limit,
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

    const availableSeats = await this.seatCounterService.getAvailable(id);

    return Result.ok({
      confirmed_count: 0,
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
}
