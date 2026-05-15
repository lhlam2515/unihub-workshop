import crypto from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import type { Registration } from "@/infra/database/types/transaction.types";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { IdempotencyMechanic } from "@/modules/payment/mechanics/idempotency.mechanic";
import {
  passthroughOrInternal,
  registrationErrors,
  seatErrors,
  systemErrors,
} from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

import { CreateRegistrationDto } from "../dto/create-registration.dto";
import {
  RegistrationResponseBuilder,
  RegistrationAdminBuilder,
  type NextStepInfo,
  type RegistrationDto,
  type RegistrationAdminDto,
} from "../dto/registration-response.dto";
import { SeatLockMechanic } from "../mechanics/seat-lock.mechanic";
import {
  CancelResult,
  RegistrationsRepository,
} from "../repositories/registrations.repository";

const PAYMENT_LOCK_TTL_MS = 900_000; // 15 minutes

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly idempotencyMechanic: IdempotencyMechanic,
    private readonly seatLock: SeatLockMechanic,
    private readonly seatCounter: SeatCounterService,
    private readonly workshopsService: WorkshopsService,
    private readonly notificationLogProducer: NotificationLogProducer
  ) {}

  private readonly logger = new Logger(RegistrationsService.name);

  /**
   * Registers a student for a workshop through a multi-stage pipeline.
   *
   * Pipeline stages:
   * 1. Fetch and validate workshop (must be PUBLISHED)
   * 2. Atomic seat decrement
   * 3. Duplicate check
   * 4. Create registration with qr_code (status based on workshop type)
   * 5a. Paid workshop: acquire 15-minute seat lock
   * 5b. Free workshop: registration is CONFIRMED immediately
   *
   * Business rules:
   * - Free workshops: status = CONFIRMED, qrCode is generated immediately.
   * - Paid workshops: status = PENDING, seat lock acquired (TTL 900s).
   * - A student cannot hold multiple active registrations for the same workshop.
   *
   * Side effects:
   * - Decrements seat:available:{workshopId} in Redis.
   * - Inserts a row into the registrations table.
   * - For paid: creates seat:lock:{workshopId}:{registrationId} in Redis (TTL 900s).
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param dto - Registration request containing the target workshop_id.
   * @param idempotencyKey - Optional idempotency key for safe retry.
   * @returns OkResult with RegistrationDto, or FailResult with codes:
   * - WORKSHOP_NOT_FOUND, WORKSHOP_NOT_PUBLISHED, SEAT_UNAVAILABLE,
   *   REGISTRATION_DUPLICATE, SEAT_LOCK_EXPIRED, INTERNAL_ERROR.
   */
  async register(
    studentId: string,
    dto: CreateRegistrationDto,
    idempotencyKey?: string
  ): Promise<Result<{ registration: RegistrationDto; isReplay: boolean }>> {
    if (idempotencyKey) {
      const idemResult = await this.idempotencyMechanic.check(
        idempotencyKey,
        "REGISTRATION"
      );
      if (idemResult.isFailure) return Result.fail(idemResult.error);
      if (!idemResult.data.proceed && idemResult.data.cachedResponse) {
        return Result.ok({
          registration: idemResult.data.cachedResponse.body as RegistrationDto,
          isReplay: true,
        });
      }
    }

    const pipeResult = await this.runRegistrationCore(studentId, dto);

    if (idempotencyKey) {
      if (pipeResult.isSuccess) {
        await this.idempotencyMechanic.markCompleted(
          idempotencyKey,
          pipeResult.data,
          201
        );
      } else {
        await this.idempotencyMechanic.markUnresolved(idempotencyKey);
      }
    }

    if (pipeResult.isFailure) return Result.fail(pipeResult.error);
    return Result.ok({ registration: pipeResult.data, isReplay: false });
  }

  private async runRegistrationCore(
    studentId: string,
    dto: CreateRegistrationDto
  ): Promise<Result<RegistrationDto>> {
    // Stage 1: Validate workshop
    const workshopResult = await this.workshopsService.getPublishedById(
      dto.workshopId
    );
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const workshop = workshopResult.data;

    // Stage 2: Cache-Aside pre-filter (ADR-13)
    const cachedSeats = await this.seatCounter.getCachedSeats(dto.workshopId);
    if (cachedSeats === 0) {
      return Result.fail(seatErrors.unavailable(dto.workshopId));
    }

    // Stage 3: Duplicate check
    const existing = await this.registrationsRepo.findByStudentAndWorkshop(
      studentId,
      dto.workshopId
    );
    if (existing.isFailure) return Result.fail(existing.error);
    if (existing.data) {
      return Result.fail(
        registrationErrors.duplicate(studentId, dto.workshopId)
      );
    }

    const isPaid = Number(workshop.price ?? "0") > 0;
    const status = isPaid ? "PENDING" : "CONFIRMED";
    const MAX_RETRIES = 1; // 2 attempts total per ADR-03

    // Stage 4-6: OL seat decrement + INSERT in transaction
    let registration: Registration | undefined;
    let attempts = 0;

    while (attempts <= MAX_RETRIES) {
      // Stage 4: Read current version for OL (ADR-03)
      const versionResult = await this.workshopsService.getSeatVersion(
        dto.workshopId
      );
      if (versionResult.isFailure) return Result.fail(versionResult.error);
      if (!versionResult.data) {
        return Result.fail(seatErrors.unavailable(dto.workshopId));
      }

      const { version } = versionResult.data;

      // Stage 5-6: OL UPDATE + INSERT in single transaction
      const txResult = await tryCatch(async () => {
        return this.registrationsRepo.transaction(async (tx) => {
          const decResult = await this.workshopsService.decrementSeat(
            dto.workshopId,
            version,
            tx
          );
          if (decResult.isFailure) throw decResult.error;

          if (decResult.data.rowsAffected === 0) {
            // Re-read to distinguish version conflict vs sold out
            const recheck = await this.workshopsService.getSeatVersion(
              dto.workshopId
            );
            if (recheck.isFailure) throw recheck.error;
            if (!recheck.data || recheck.data.seatsAvailable === 0) {
              throw seatErrors.unavailable(dto.workshopId);
            }
            // Version conflict — will retry
            throw { __versionConflict: true };
          }

          const regResult = await this.registrationsRepo.create(
            {
              studentId,
              workshopId: dto.workshopId,
              qrCode: crypto.randomUUID(),
              status,
              confirmedAt: status === "CONFIRMED" ? new Date() : null,
            },
            tx
          );
          if (regResult.isFailure) throw regResult.error;
          return regResult.data;
        });
      }, passthroughOrInternal);

      if (txResult.isSuccess) {
        registration = txResult.data;
        break;
      }

      // Check if version conflict (retryable) or hard error
      const error = txResult.error;
      if (
        typeof error === "object" &&
        error !== null &&
        "__versionConflict" in error
      ) {
        attempts++;
        continue;
      }

      // Hard error — sold out or internal
      return Result.fail(error);
    }

    // If we exhausted retries, return high contention
    if (!registration) {
      return Result.fail(systemErrors.dbLockTimeout("registration", 2));
    }

    // Stage 7: Write-Invalidate cache (ADR-13, fire-and-forget outside tx)
    await this.seatCounter.invalidateCache(dto.workshopId);

    // Stage 8: Paid — acquire seat lock
    if (isPaid) {
      const lockResult = await this.seatLock.acquire(
        dto.workshopId,
        registration.registrationId,
        studentId
      );
      if (lockResult.isFailure) {
        // Compensate: release seat + invalidate cache
        const incrResult = await this.workshopsService.incrementSeat(
          dto.workshopId
        );
        if (incrResult.isFailure) {
          this.logger.error(
            `Seat compensation failed for workshop ${dto.workshopId}: ${incrResult.error.message}`
          );
        }

        const statusResult = await this.registrationsRepo.updateStatus(
          registration.registrationId,
          "CANCELLED"
        );
        if (statusResult.isFailure) {
          this.logger.error(
            `Status rollback failed: ${statusResult.error.message}`
          );
        }

        await this.seatCounter.invalidateCache(dto.workshopId);
        return Result.fail(lockResult.error);
      }
    }

    // Build nextStep for paid workshops
    const nextStep: NextStepInfo | undefined = isPaid
      ? {
          action: "CREATE_PAYMENT",
          endpoint: "/api/v1/payments",
          amount: Number(workshop.price ?? "0"),
          currency: "VND",
          expiresAt: new Date(Date.now() + PAYMENT_LOCK_TTL_MS).toISOString(),
        }
      : undefined;

    const response = RegistrationResponseBuilder.from(registration, {
      nextStep: nextStep ?? null,
    });

    // Create notification log for free workshop registration
    if (!isPaid) {
      const roomName = await this.workshopsService.getRoomNameForWorkshop(
        dto.workshopId
      );

      void this.notificationLogProducer.createAndEnqueue({
        userId: studentId,
        workshopId: dto.workshopId,
        type: "REGISTRATION_CONFIRMED",
        payload: {
          workshopId: dto.workshopId,
          workshopTitle: workshop.title,
          startsAt: workshop.startsAt.toISOString(),
          location: roomName ?? "",
          qrCode: registration.qrCode,
        },
      });
    }

    return Result.ok(response);
  }

  /**
   * Lists a student's own registrations.
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param query - Optional filters: status, page, limit.
   * @returns OkResult with paginated RegistrationDto list.
   */
  async getMyRegistrations(
    studentId: string,
    query?: {
      status?: string[];
      upcoming?: boolean;
      cursor?: string;
      limit?: number;
    }
  ): Promise<
    Result<{
      items: RegistrationDto[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    const result = await this.registrationsRepo.findMyRegistrations(
      studentId,
      query
    );
    if (result.isFailure) return Result.fail(result.error);

    const items = result.data.items.map((item) =>
      RegistrationResponseBuilder.from(item, {
        workshop: {
          id: item.workshopId,
          title: item.workshopTitle,
          startsAt: (item.workshopStartsAt ?? new Date()).toISOString(),
          endsAt: (item.workshopEndsAt ?? new Date()).toISOString(),
          seatsTotal: item.workshopSeatsTotal ?? 0,
          seatsAvailable: item.workshopSeatsAvailable ?? 0,
          price: item.workshopPrice ?? 0,
          currency: "VND",
          status: item.workshopStatus ?? "",
          speaker: item.speakerId
            ? {
                id: item.speakerId,
                fullName: item.speakerFullName ?? "",
                title: item.speakerTitle,
                avatarUrl: item.speakerAvatarUrl,
              }
            : null,
          room: item.roomId
            ? {
                id: item.roomId,
                name: item.roomName ?? "",
                building: item.roomBuilding,
                floor: item.roomFloor,
                floorPlanUrl: item.roomFloorPlanUrl,
              }
            : null,
          isRegistered: true,
        },
      })
    );

    return Result.ok({
      items,
      nextCursor: result.data.nextCursor,
      hasMore: result.data.hasMore,
      limit: query?.limit ?? 20,
    });
  }

  /**
   * Retrieves a single registration's detail with IDOR enforcement.
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param registrationId - The UUID of the registration to retrieve.
   * @returns OkResult with RegistrationDto, or FailResult (REGISTRATION_NOT_FOUND).
   */
  async getRegistrationDetail(
    studentId: string,
    registrationId: string
  ): Promise<Result<RegistrationDto>> {
    const result = await this.findByIdWithOwnershipCheck(
      registrationId,
      studentId
    );
    if (result.isFailure) return Result.fail(result.error);

    const registration = result.data;

    // Compute nextStep for PENDING (paid) registrations so the pay page
    // has the amount, currency, and deadline to render the payment form.
    let nextStep: NextStepInfo | null = null;
    if (registration.status === "PENDING") {
      const wsResult = await this.workshopsService.getPublishedById(
        registration.workshopId
      );
      if (wsResult.isSuccess) {
        const workshop = wsResult.data;
        const isPaid = Number(workshop.price ?? "0") > 0;
        if (isPaid) {
          nextStep = {
            action: "CREATE_PAYMENT" as const,
            endpoint: "/api/v1/payments",
            amount: Number(workshop.price ?? "0"),
            currency: "VND",
            expiresAt: new Date(
              registration.registeredAt.getTime() + PAYMENT_LOCK_TTL_MS
            ).toISOString(),
          };
        }
      }
    }

    return Result.ok(
      RegistrationResponseBuilder.from(registration, { nextStep })
    );
  }

  /**
   * Lists registrations for a workshop (admin view).
   *
   * Returns registrations with student info and check-in status.
   *
   * @param workshopId - The UUID of the workshop.
   * @param filters - Optional status filter and pagination.
   * @returns OkResult with paginated RegistrationAdminDto items.
   */
  async getRegistrationsForWorkshop(
    workshopId: string,
    filters?: { status?: string[]; cursor?: string; limit?: number }
  ): Promise<
    Result<{
      items: RegistrationAdminDto[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    const result = await this.registrationsRepo.findByWorkshopId(
      workshopId,
      filters
    );
    if (result.isFailure) return Result.fail(result.error);

    const items = result.data.items.map((item) =>
      RegistrationAdminBuilder.from(item)
    );

    return Result.ok({
      items,
      nextCursor: result.data.nextCursor,
      hasMore: result.data.hasMore,
      limit: result.data.limit,
    });
  }

  /**
   * Cancels a student's own registration, releases the seat, and clears lock.
   *
   * Business rules:
   * - Only CONFIRMED or PENDING registrations can be cancelled.
   * - IDOR: returns REGISTRATION_NOT_FOUND for non-owned registrations.
   *
   * Side effects:
   * - Updates registration status to CANCELLED.
   * - Increments seat:available:{workshopId} in Redis.
   * - Deletes seat:lock:{workshopId}:{registrationId} in Redis (if paid).
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param registrationId - The UUID of the registration to cancel.
   * @returns OkResult with the updated RegistrationDto, or FailResult.
   */
  async cancelRegistration(
    studentId: string,
    registrationId: string
  ): Promise<Result<RegistrationDto>> {
    const result = await this.findByIdWithOwnershipCheck(
      registrationId,
      studentId
    );
    if (result.isFailure) return Result.fail(result.error);
    const registration = result.data;

    if (registration.status === "CANCELLED") {
      return Result.fail(registrationErrors.alreadyCancelled(registrationId));
    }

    const updateResult = await this.registrationsRepo.updateStatus(
      registrationId,
      "CANCELLED"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Release seat via PostgreSQL (source of truth) + invalidate cache
    await Promise.all([
      this.workshopsService.incrementSeat(registration.workshopId),
      registration.status === "PENDING"
        ? this.seatLock.release(registration.workshopId, registrationId)
        : Promise.resolve(),
    ]);
    await this.seatCounter.invalidateCache(registration.workshopId);

    const response = RegistrationResponseBuilder.from(updateResult.data);

    // Create notification log for registration cancellation
    void this.notificationLogProducer.createAndEnqueue({
      userId: studentId,
      workshopId: registration.workshopId,
      type: "REGISTRATION_CANCELLED",
      payload: { registrationId },
    });

    return Result.ok(response);
  }

  /**
   * Counts CONFIRMED registrations for a workshop.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the count, or FailResult (INTERNAL_ERROR).
   */
  /**
   * Cancels all active (CONFIRMED or PENDING) registrations for a workshop.
   *
   * Called asynchronously via BullMQ when a workshop is cancelled.
   * Returns the count of affected registrations. Idempotent — safe
   * to call multiple times (already-cancelled registrations are skipped).
   *
   * Side effects:
   * - Bulk-updates multiple rows in the registrations table.
   * - Sets cancelledAt and updatedAt on each affected row.
   *
   * @param workshopId - UUID of the cancelled workshop.
   * @returns OkResult with { cancelledCount }, or FailResult (INTERNAL_ERROR).
   */
  async cancelAllForWorkshop(
    workshopId: string
  ): Promise<Result<CancelResult>> {
    return this.registrationsRepo.cancelAllForWorkshop(workshopId);
  }

  async countConfirmedByWorkshop(workshopId: string): Promise<Result<number>> {
    return this.registrationsRepo.countConfirmedByWorkshop(workshopId);
  }

  private async findByIdWithOwnershipCheck(
    registrationId: string,
    studentId: string
  ): Promise<Result<Registration>> {
    const result = await this.registrationsRepo.findById(registrationId);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data || result.data.studentId !== studentId) {
      return Result.fail(registrationErrors.notFound(registrationId));
    }
    return Result.ok(result.data);
  }
}
