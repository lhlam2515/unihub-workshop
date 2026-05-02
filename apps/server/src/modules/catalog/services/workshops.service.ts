/**
 * Workshops Service
 *
 * Core business logic for the Catalog module.
 * Handles the full workshop lifecycle: creation (DRAFT), publishing (PUBLISHED),
 * emergency updates, cancellation, and public/admin querying.
 *
 * Business rules:
 * - Workshops start in DRAFT status and transition through PUBLISHED or CANCELLED.
 * - Room time conflicts are validated before create/update/publish operations.
 * - Redis seat counters are initialized on publish and deleted on cancel.
 * - Emergency updates only affect room_id, starts_at, ends_at of PUBLISHED workshops.
 *
 * Cross-module:
 * - RoomConflictService and SeatCounterService are used from within the Catalog module.
 * - SeatCounterService is exported for cross-module use by the Booking module.
 */

import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import type {
  NewWorkshop,
  WorkshopUpdate,
  Workshop,
  Speaker,
  Room,
  WorkshopSlot,
} from "@/database/types/event-core.types";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomConflictService } from "./room-conflict.service";
import { SeatCounterService } from "./seat-counter.service";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";
import { WorkshopResponseBuilder } from "../dto/workshop-response.dto";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { RoomsRepository } from "../repositories/rooms.repository";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";
import { WorkshopSlotsRepository } from "../repositories/workshop-slots.repository";
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

type WorkshopWithRelations = Workshop & {
  workshopSlots: WorkshopSlot;
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
    private readonly workshopSlotsRepo: WorkshopSlotsRepository,
    private readonly workshopDocumentsRepo: WorkshopDocumentsRepository,
    private readonly aiSummariesRepo: AiSummariesRepository,
    private readonly notificationPublisher: WorkshopNotificationPublisher
  ) {}

  // ---------------------------------------------------------------------------
  // Public Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Lists published workshops for public browsing.
   *
   * Business rules:
   * - Only PUBLISHED workshops are returned.
   * - Available seat counts are fetched from Redis for real-time accuracy.
   *
   * @param query - Filtering and pagination parameters (faculty, date range, is_paid).
   * @returns OkResult containing an array of summary DTOs with seat availability and speaker names, or FailResult (INTERNAL_ERROR).
   */
  async listPublished(query: ListWorkshopsQueryDto): Promise<
    Result<{
      items: WorkshopSummaryDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const result = await this.workshopsRepo.findPublished(query);
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
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Retrieves public detail of a single published workshop.
   *
   * Business rules:
   * - The workshop must be in PUBLISHED status.
   * - Available seat count is fetched from Redis for real-time accuracy.
   * - AI summary is included if available (summary_text only exposed when status is DONE).
   *
   * @param id - The UUID of the workshop.
   * @returns OkResult containing the detail DTO, or FailResult (WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, INTERNAL_ERROR).
   */
  async getPublicDetail(id: string): Promise<Result<WorkshopDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "PUBLISHED") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    const [availableSeats, summaryResult] = await Promise.all([
      this.seatCounterService.getAvailable(id),
      this.aiSummariesRepo.findByWorkshopId(id),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromDetail(
        workshop,
        workshopRow.speakers?.fullName ?? "Unknown",
        workshopRow.rooms?.name ?? "Unknown",
        availableSeats,
        summaryResult.isSuccess ? summaryResult.data : undefined
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  /**
   * Creates a new workshop in DRAFT status.
   *
   * Business rules:
   * - Room time conflicts are validated before creation.
   * - The workshop always starts in DRAFT status.
   * - A WorkshopSlot record is created alongside the workshop.
   * - Speaker existence is validated (optional, falls back gracefully).
   *
   * Side effects:
   * - Inserts a record into the workshops table.
   * - Inserts a record into the workshop_slots table.
   *
   * @param dto - Workshop creation payload with snake_case fields from API.
   * @param userId - The UUID of the creating user (from JWT sub).
   * @returns OkResult containing the admin detail DTO, or FailResult with WORKSHOP_TIME_CONFLICT, INTERNAL_ERROR.
   */
  async createWorkshop(
    dto: CreateWorkshopDto,
    userId: string
  ): Promise<Result<WorkshopAdminDetailDto>> {
    // Validate room time conflict
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
      capacity: dto.capacity,
      isPaid: dto.is_paid,
      price: dto.is_paid && dto.price ? String(dto.price) : null,
      status: "DRAFT",
      createdBy: userId,
    };

    const workshopResult = await this.workshopsRepo.create(workshopData);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    // Create slot for seat tracking
    const slotResult = await this.workshopSlotsRepo.create(
      workshopResult.data.workshopId,
      dto.capacity
    );
    if (slotResult.isFailure) return Result.fail(slotResult.error);

    // Resolve related data for response
    const [speakerResult, roomResult] = await Promise.all([
      this.speakersRepo.findById(dto.speaker_id),
      this.roomsRepo.findById(dto.room_id),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshopResult.data,
        slotResult.data,
        speakerResult.isSuccess && speakerResult.data
          ? speakerResult.data.fullName
          : "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        dto.capacity
      )
    );
  }

  /**
   * Updates a draft workshop's fields.
   *
   * Business rules:
   * - Only workshops in DRAFT status can be updated.
   * - If room or time fields change, room conflicts are re-validated.
   * - Price can only be set when is_paid is true.
   *
   * Side effects:
   * - Updates the workshops table record.
   *
   * @param id - The UUID of the workshop to update.
   * @param dto - Partial update payload with snake_case fields.
   * @returns OkResult containing the updated admin detail DTO, or FailResult with WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, WORKSHOP_TIME_CONFLICT.
   */
  async updateWorkshop(
    id: string,
    dto: UpdateWorkshopDto
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "DRAFT") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    // Check room conflicts if room or time changed
    const roomId = dto.room_id ?? workshop.roomId;
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

    // Build update payload (only provided fields)
    const updateData: WorkshopUpdate = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.speaker_id !== undefined) updateData.speakerId = dto.speaker_id;
    if (dto.room_id !== undefined) updateData.roomId = dto.room_id;
    if (dto.starts_at !== undefined) updateData.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) updateData.endsAt = dto.ends_at;
    if (dto.capacity !== undefined) updateData.capacity = dto.capacity;
    if (dto.is_paid !== undefined) updateData.isPaid = dto.is_paid;
    if (dto.price !== undefined) {
      updateData.price = dto.price !== null ? String(dto.price) : null;
    }

    const updateResult = await this.workshopsRepo.update(id, updateData);
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Resolve related data for response
    const [slotResult, speakerResult, roomResult] = await Promise.all([
      this.workshopSlotsRepo.findByWorkshopId(id),
      this.speakersRepo.findById(workshop.speakerId),
      this.roomsRepo.findById(workshop.roomId),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        slotResult.isSuccess && slotResult.data ? slotResult.data : null,
        speakerResult.isSuccess && speakerResult.data
          ? speakerResult.data.fullName
          : "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        updateResult.data.capacity
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Publishing & Emergency Updates
  // ---------------------------------------------------------------------------

  /**
   * Publishes a draft workshop, making it visible and bookable by students.
   *
   * Business rules:
   * - Only DRAFT workshops can be published.
   * - The Redis seat counter is initialized to the workshop's capacity.
   * - If no WorkshopSlot exists, one is created during publishing.
   *
   * Side effects:
   * - Updates workshop status to 'PUBLISHED'.
   * - Creates/updates the WorkshopSlot record if needed.
   * - Sets `seat:available:{workshopId}` key in Redis.
   *
   * @param id - The UUID of the workshop to publish.
   * @returns OkResult containing the published admin detail DTO, or FailResult with WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED.
   */
  async publishWorkshop(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "DRAFT") {
      return Result.fail(
        workshop.status === "PUBLISHED"
          ? workshopErrors.alreadyPublished(id)
          : workshopErrors.notPublished(id, workshop.status)
      );
    }

    // Update status to PUBLISHED
    const updateResult = await this.workshopsRepo.updateStatus(id, "PUBLISHED");
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Ensure slot exists (may have been created during draft)
    let slotResult = await this.workshopSlotsRepo.findByWorkshopId(id);
    if (slotResult.isFailure) return Result.fail(slotResult.error);
    if (!slotResult.data) {
      slotResult = await this.workshopSlotsRepo.create(id, workshop.capacity);
      if (slotResult.isFailure) return Result.fail(slotResult.error);
    }

    // Initialize Redis seat counter
    await this.seatCounterService.initialize(id, workshop.capacity);

    // Resolve related data for response
    const roomResult = await this.roomsRepo.findById(workshop.roomId);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        slotResult.data,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        workshop.capacity
      )
    );
  }

  /**
   * Performs an emergency update on a published workshop.
   *
   * Allows modifying room, start time, or end time of an already published
   * workshop without going through the full edit-publish cycle.
   *
   * Business rules:
   * - Only PUBLISHED workshops can receive emergency updates.
   * - Room time conflicts are re-validated (excludes the current workshop).
   * - Only room_id, starts_at, and ends_at can be modified via this endpoint.
   * - At least one field must be provided (validated by Zod).
   *
   * Side effects:
   * - Updates the workshops table with new scheduling fields.
   *
   * @param id - The UUID of the workshop to update.
   * @param dto - Emergency update payload (room_id?, starts_at?, ends_at?).
   * @returns OkResult containing the updated admin detail DTO, or FailResult with WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, WORKSHOP_TIME_CONFLICT.
   */
  async emergencyUpdate(
    id: string,
    dto: EmergencyUpdateWorkshopDto
  ): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status !== "PUBLISHED") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    // Determine effective values (existing or updated)
    const roomId = dto.room_id ?? workshop.roomId;
    const startsAt = dto.starts_at ?? workshop.startsAt;
    const endsAt = dto.ends_at ?? workshop.endsAt;

    // Check room conflicts (exclude self)
    if (dto.room_id || dto.starts_at || dto.ends_at) {
      const conflictResult = await this.roomConflictService.checkConflict(
        roomId,
        startsAt,
        endsAt,
        id
      );
      if (conflictResult.isFailure) return Result.fail(conflictResult.error);
    }

    // Update only scheduling fields
    const updateData: WorkshopUpdate = {};
    if (dto.room_id !== undefined) updateData.roomId = dto.room_id;
    if (dto.starts_at !== undefined) updateData.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) updateData.endsAt = dto.ends_at;

    const updateResult = await this.workshopsRepo.update(id, updateData);
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Publish emergency update event for async notification (fire-and-forget)
    const changes: { roomId?: string; startsAt?: Date; endsAt?: Date } = {};
    if (dto.room_id !== undefined) changes.roomId = dto.room_id;
    if (dto.starts_at !== undefined) changes.startsAt = dto.starts_at;
    if (dto.ends_at !== undefined) changes.endsAt = dto.ends_at;
    void this.notificationPublisher.publishEmergencyUpdate(workshop, changes);

    // Resolve related data for response
    const [slotResult, roomResult] = await Promise.all([
      this.workshopSlotsRepo.findByWorkshopId(id),
      this.roomsRepo.findById(workshop.roomId),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        slotResult.isSuccess && slotResult.data ? slotResult.data : null,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        workshop.capacity
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  /**
   * Cancels a workshop, transitioning it to CANCELLED status.
   *
   * Business rules:
   * - Workshops that are already CANCELLED cannot be cancelled again.
   * - If the workshop was PUBLISHED, the Redis seat counter is deleted.
   *
   * Side effects:
   * - Updates workshop status to 'CANCELLED'.
   * - Deletes the `seat:available:{workshopId}` key from Redis if the workshop
   *   was previously PUBLISHED.
   *
   * Cross-module contract:
   * - Currently only updates local state. When the Booking module exists,
   *   this should also call BookingService to void registrations and tickets.
   *
   * @param id - The UUID of the workshop to cancel.
   * @returns OkResult containing the cancelled admin detail DTO, or FailResult with WORKSHOP_NOT_FOUND, WORKSHOP_CANCELLED.
   */
  async cancelWorkshop(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    if (workshop.status === "CANCELLED") {
      return Result.fail(workshopErrors.cancelled(id));
    }

    const wasPublished = workshop.status === "PUBLISHED";

    // Update status to CANCELLED
    const updateResult = await this.workshopsRepo.updateStatus(id, "CANCELLED");
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Delete Redis seat counter if workshop was published
    if (wasPublished) {
      await this.seatCounterService.delete(id);
    }

    // Publish cancellation event for async notification (fire-and-forget)
    void this.notificationPublisher.publishCancelled(workshop);

    // Resolve related data for response
    const [slotResult, roomResult] = await Promise.all([
      this.workshopSlotsRepo.findByWorkshopId(id),
      this.roomsRepo.findById(workshop.roomId),
    ]);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        updateResult.data,
        slotResult.isSuccess && slotResult.data ? slotResult.data : null,
        workshopRow.speakers?.fullName ?? "Unknown",
        roomResult.isSuccess && roomResult.data
          ? roomResult.data.name
          : "Unknown",
        workshop.capacity
      )
    );
  }

  /**
   * Retrieves a published workshop by ID for cross-module use (Booking).
   *
   * Business rules:
   * - The workshop must exist and be in PUBLISHED status.
   * - Returns WORKSHOP_NOT_FOUND if the workshop does not exist.
   * - Returns WORKSHOP_NOT_PUBLISHED if the workshop exists but is not published.
   *
   * @param id - The UUID of the workshop.
   * @returns OkResult containing the Workshop entity, or FailResult (WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, INTERNAL_ERROR).
   */
  async getPublishedById(id: string): Promise<Result<Workshop>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    if (!workshopResult.data) {
      return Result.fail(workshopErrors.notFound(id));
    }

    const workshop = workshopResult.data.workshops;
    if (workshop.status !== "PUBLISHED") {
      return Result.fail(workshopErrors.notPublished(id, workshop.status));
    }

    return Result.ok(workshop);
  }

  // ---------------------------------------------------------------------------
  // Admin Queries
  // ---------------------------------------------------------------------------

  /**
   * Retrieves full admin detail for a single workshop by ID.
   *
   * Returns workshops in any status including slot counters (confirmed, locked)
   * and the creator's identity.
   *
   * @param id - The UUID of the workshop.
   * @returns OkResult containing the admin detail DTO with related entities, or FailResult (WORKSHOP_NOT_FOUND, INTERNAL_ERROR).
   */
  async getAdminDetail(id: string): Promise<Result<WorkshopAdminDetailDto>> {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    const slotResult = await this.workshopSlotsRepo.findByWorkshopId(id);

    return Result.ok(
      WorkshopResponseBuilder.fromAdminDetail(
        workshop,
        slotResult.isSuccess && slotResult.data ? slotResult.data : null,
        workshopRow.speakers?.fullName ?? "Unknown",
        workshopRow.rooms?.name ?? "Unknown",
        workshop.capacity
      )
    );
  }

  /**
   * Lists all workshops for admin management with optional status filter.
   *
   * Business rules:
   * - Returns workshops in any status (DRAFT, PUBLISHED, CANCELLED).
   * - Filters by status if provided, otherwise returns all statuses.
   * - Results are paginated and ordered by creation date descending.
   *
   * @param query - Query parameters for filtering (status?, page?, limit?).
   * @returns OkResult containing an array of admin detail DTOs with slot, speaker, and room data, or FailResult (INTERNAL_ERROR).
   */
  async listAdmin(query: ListWorkshopsQueryDto): Promise<
    Result<{
      items: WorkshopAdminDetailDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const result = await this.workshopsRepo.listAdmin(query);
    if (result.isFailure) return Result.fail(result.error);

    const { items, total } = result.data;
    const mapped = items.map((workshop: WorkshopWithRelations) =>
      WorkshopResponseBuilder.fromAdminDetail(
        workshop,
        workshop.workshopSlots,
        workshop.speakers?.fullName ?? "Unknown",
        workshop.rooms?.name ?? "Unknown",
        workshop.capacity
      )
    );

    return Result.ok({
      items: mapped,
      total,
      page: query.page,
      limit: query.limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Retrieves real-time statistics for a specific workshop.
   *
   * Business rules:
   * - confirmed_count and locked_count come from the WorkshopSlot record.
   * - available_seats comes from Redis for real-time accuracy.
   * - total_capacity is the workshop's configured capacity.
   *
   * @param id - The UUID of the workshop.
   * @returns OkResult containing stats object (confirmed_count, locked_count, available_seats, total_capacity), or FailResult (WORKSHOP_NOT_FOUND, INTERNAL_ERROR).
   */
  async getStats(id: string): Promise<
    Result<{
      confirmed_count: number;
      locked_count: number;
      available_seats: number;
      total_capacity: number;
    }>
  > {
    const workshopResult = await this.workshopsRepo.findById(id);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshopRow = workshopResult.data!;
    const workshop = workshopRow.workshops;

    const [slotResult, availableSeats] = await Promise.all([
      this.workshopSlotsRepo.findByWorkshopId(id),
      this.seatCounterService.getAvailable(id),
    ]);

    return Result.ok({
      confirmed_count:
        slotResult.isSuccess && slotResult.data
          ? slotResult.data.confirmedCount
          : 0,
      locked_count:
        slotResult.isSuccess && slotResult.data
          ? slotResult.data.lockedCount
          : 0,
      available_seats: availableSeats,
      total_capacity: workshop.capacity,
    });
  }

  // ---------------------------------------------------------------------------
  // Cron Jobs
  // ---------------------------------------------------------------------------

  /**
   * Auto-completes PUBLISHED workshops whose end time has passed.
   *
   * Business rules:
   * - Only PUBLISHED workshops with endsAt < now() are eligible.
   * - Transition is idempotent — already COMPLETED/CANCELLED workshops are excluded.
   * - Redis seat counter key is NOT deleted (COMPLETED is a display state, not cancel).
   *
   * Side effects:
   * - Updates workshop status to COMPLETED in bulk.
   *
   * @returns OkResult containing the count of completed workshops, or FailResult (INTERNAL_ERROR).
   */
  @Cron("0 * * * *")
  async completePastWorkshops(): Promise<Result<number>> {
    return this.workshopsRepo.completePastPublished();
  }

  /**
   * Retrieves workshopId and capacity for all PUBLISHED workshops.
   *
   * Lightweight query used by the background reconciliation cron to iterate
   * over active workshops without loading full entity data.
   *
   * @returns OkResult containing an array of { workshopId, capacity } objects, or FailResult (INTERNAL_ERROR).
   */
  async getPublishedWorkshopsBasic(): Promise<
    Result<{ workshopId: string; capacity: number }[]>
  > {
    return this.workshopsRepo.findPublishedBasic();
  }

  /**
   * Reconciles the locked and confirmed counters for a workshop slot.
   *
   * Used by the background reconciliation cron to correct drift between
   * Redis seat counters and the database.
   *
   * Side effects:
   * - UPSERTs workshop_slots with provided counts.
   *
   * @param workshopId - The UUID of the workshop.
   * @param capacity - The total seat capacity of the workshop.
   * @param lockedCount - The corrected locked seat count.
   * @param confirmedCount - The corrected confirmed seat count.
   * @returns OkResult containing the updated WorkshopSlot record, or FailResult (INTERNAL_ERROR).
   */
  async reconcileSlot(
    workshopId: string,
    lockedCount: number,
    confirmedCount: number
  ): Promise<Result<WorkshopSlot>> {
    return this.workshopSlotsRepo.reconcile(
      workshopId,
      lockedCount,
      confirmedCount
    );
  }

  /**
   * Retrieves a workshop slot by workshop ID.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with the WorkshopSlot, or null if not found.
   */
  async getSlotByWorkshopId(
    workshopId: string
  ): Promise<Result<WorkshopSlot | null>> {
    return this.workshopSlotsRepo.findByWorkshopId(workshopId);
  }
}
