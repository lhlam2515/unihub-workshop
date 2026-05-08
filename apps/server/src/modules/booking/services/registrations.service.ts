import crypto from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { Registration } from "@/infra/database/types/transaction.types";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import { IdempotencyMechanic } from "@/modules/payment/mechanics/idempotency.mechanic";
import { registrationErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { CreateRegistrationDto } from "../dto/create-registration.dto";
import {
  RegistrationResponseBuilder,
  type NextStepInfo,
  type RegistrationDto,
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
   * @param studentId - The UUID of the student (from JWT).
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
  ): Promise<Result<RegistrationDto>> {
    if (idempotencyKey) {
      const idemResult = await this.idempotencyMechanic.check(
        idempotencyKey,
        "REGISTRATION"
      );
      if (idemResult.isFailure) return Result.fail(idemResult.error);
      if (!idemResult.data.proceed && idemResult.data.cachedResponse) {
        return Result.ok(
          idemResult.data.cachedResponse.body as RegistrationDto
        );
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

    return pipeResult;
  }

  private async runRegistrationCore(
    studentId: string,
    dto: CreateRegistrationDto
  ): Promise<Result<RegistrationDto>> {
    const workshopResult = await this.workshopsService.getPublishedById(
      dto.workshop_id
    );
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);

    const seatResult = await this.seatCounter.decrement(dto.workshop_id);
    if (seatResult.isFailure) return Result.fail(seatResult.error);

    const existing = await this.registrationsRepo.findByStudentAndWorkshop(
      studentId,
      dto.workshop_id
    );
    if (existing.isFailure) {
      await this.seatCounter.increment(dto.workshop_id);
      return Result.fail(existing.error);
    }
    if (existing.data) {
      await this.seatCounter.increment(dto.workshop_id);
      return Result.fail(
        registrationErrors.duplicate(studentId, dto.workshop_id)
      );
    }

    const isPaid = Number(workshopResult.data.price ?? "0") > 0;
    const status = isPaid ? "PENDING" : "CONFIRMED";

    const regResult = await this.registrationsRepo.create({
      studentId,
      workshopId: dto.workshop_id,
      qrCode: crypto.randomUUID(),
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    });
    if (regResult.isFailure) {
      await this.seatCounter.increment(dto.workshop_id);
      return Result.fail(regResult.error);
    }
    const registration = regResult.data;

    // Paid: acquire seat lock
    if (isPaid) {
      const workshop = workshopResult.data;
      const lockResult = await this.seatLock.acquire(
        dto.workshop_id,
        registration.registrationId,
        studentId,
        Number(workshop.price ?? "0")
      );
      if (lockResult.isFailure) {
        await this.registrationsRepo.updateStatus(
          registration.registrationId,
          "CANCELLED"
        );
        await this.seatCounter.increment(dto.workshop_id);
        return Result.fail(lockResult.error);
      }
    }

    // Build nextStep for paid workshops
    const nextStep: NextStepInfo | undefined = isPaid
      ? {
          action: "CREATE_PAYMENT",
          endpoint: "/api/v1/payments",
          amount: Number(workshopResult.data.price ?? "0"),
          currency: "VND",
          expiresAt: new Date(Date.now() + PAYMENT_LOCK_TTL_MS),
        }
      : undefined;

    const response = RegistrationResponseBuilder.from(registration, {
      nextStep: nextStep ?? null,
    });

    // Create notification log for free workshop registration
    if (!isPaid) {
      void this.notificationLogProducer.createAndEnqueue({
        userId: studentId,
        workshopId: dto.workshop_id,
        type: "REGISTRATION_CONFIRMED",
        payload: { registrationId: registration.registrationId },
      });
    }

    return Result.ok(response);
  }

  /**
   * Lists a student's own registrations.
   *
   * @param studentId - The UUID of the student (from JWT).
   * @param query - Optional filters: status, page, limit.
   * @returns OkResult with paginated RegistrationDto list.
   */
  async getMyRegistrations(
    studentId: string,
    query?: { status?: string; page?: number; limit?: number }
  ): Promise<
    Result<{
      items: RegistrationDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const result = await this.registrationsRepo.findMyRegistrations(
      studentId,
      query?.status,
      { page: query?.page, limit: query?.limit }
    );
    if (result.isFailure) return Result.fail(result.error);

    const items = result.data.items.map((item) =>
      RegistrationResponseBuilder.from(item)
    );

    return Result.ok({
      items,
      total: result.data.total,
      page: query?.page ?? 1,
      limit: query?.limit ?? 20,
    });
  }

  /**
   * Retrieves a single registration's detail with IDOR enforcement.
   *
   * @param studentId - The UUID of the student (from JWT).
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

    return Result.ok(RegistrationResponseBuilder.from(result.data));
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
   * @param studentId - The UUID of the student (from JWT).
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

    // Release seat + lock in parallel (both idempotent)
    await Promise.all([
      this.seatCounter.increment(registration.workshopId),
      registration.status === "PENDING"
        ? this.seatLock.release(registration.workshopId, registrationId)
        : Promise.resolve(),
    ]);

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
