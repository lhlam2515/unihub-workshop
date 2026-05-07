import crypto from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { Registration } from "@/infra/database/types/transaction.types";
import type { RegistrationEventData } from "@/infra/messaging/event-contracts";
import { NotificationPublisher } from "@/infra/messaging/notification-publisher";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { GlobalRateLimitMechanic } from "@/modules/rate-limit/services/global-rate-limit.service";
import { RateLimiterMechanic } from "@/modules/rate-limit/services/rate-limiter.service";
import { registrationErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { TicketsService } from "./tickets.service";
import { CreateRegistrationDto } from "../dto/create-registration.dto";
import { RegistrationResponseBuilder } from "../dto/registration-response.dto";
import { SeatLockMechanic } from "../mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "../repositories/registrations.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

import type { RegistrationDto } from "../dto/registration-response.dto";

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly ticketsRepo: TicketsRepository,
    private readonly rateLimiter: RateLimiterMechanic,
    private readonly globalRateLimit: GlobalRateLimitMechanic,
    private readonly seatLock: SeatLockMechanic,
    private readonly seatCounter: SeatCounterService,
    private readonly workshopsService: WorkshopsService,
    private readonly ticketsService: TicketsService,
    private readonly notificationPublisher: NotificationPublisher
  ) {}

  /**
   * Registers a student for a workshop through a multi-stage pipeline with
   * compensating rollback actions at every post-DECR failure point.
   *
   * Pipeline stages:
   * 1. Fetch and validate workshop (must be PUBLISHED)
   * 2. Global rate limit check (500 req/s)
   * 3. Per-user rate limit check (Token Bucket: 5 tokens, 1/10s refill)
   * 4. Atomic seat decrement with rollback on failure
   * 5. Duplicate check (one active registration per student per workshop)
   * 6. Registration creation with status based on workshop type
   * 7a. Paid workshop: acquire 15-minute seat lock
   * 7b. Free workshop: issue ticket immediately
   * 8. Build and return response DTO
   *
   * Business rules:
   * - Free workshops: status = CONFIRMED, ticket issued immediately.
   * - Paid workshops: status = PENDING_PAYMENT, seat lock acquired (TTL 900s).
   * - A student cannot hold multiple active registrations for the same workshop.
   * - Workshop capacity cannot be exceeded (Redis DECR enforces atomicity).
   *
   * Side effects:
   * - Decrements seat:available:{workshopId} in Redis.
   * - Inserts a row into the registrations table.
   * - For paid: creates seat:lock:{workshopId}:{registrationId} in Redis (TTL 900s).
   * - For free: inserts a row into the tickets table.
   *
   * @param studentId - The UUID of the student (from JWT, never from request body).
   * @param dto - Registration request containing the target workshop_id.
   * @returns OkResult with RegistrationDto (includes payment_deadline and amount for paid),
   * or FailResult with codes:
   * - WORKSHOP_NOT_FOUND: Workshop does not exist.
   * - WORKSHOP_NOT_PUBLISHED: Workshop is not open for registration.
   * - RATE_LIMIT_EXCEEDED: Global or per-user rate limit triggered.
   * - SEAT_UNAVAILABLE: Workshop is at full capacity.
   * - REGISTRATION_DUPLICATE: Student already has an active registration.
   * - SEAT_LOCK_EXPIRED: Seat lock acquisition failed (key collision).
   * - INTERNAL_ERROR: Unexpected database or Redis failure.
   */
  async register(
    studentId: string,
    dto: CreateRegistrationDto
  ): Promise<Result<RegistrationDto>> {
    // Stages 1-3: Run independent checks in parallel
    const [workshopResult, globalCheck, userCheck] = await Promise.all([
      this.workshopsService.getPublishedById(dto.workshop_id),
      this.globalRateLimit.check(),
      this.rateLimiter.consumeToken(studentId),
    ]);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    if (globalCheck.isFailure) return Result.fail(globalCheck.error);
    if (userCheck.isFailure) return Result.fail(userCheck.error);

    // Stage 4: Atomic seat decrement with rollback
    const seatResult = await this.seatCounter.decrement(dto.workshop_id);
    if (seatResult.isFailure) return Result.fail(seatResult.error);

    // Stage 5: UNIQUE check (student + workshop)
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

    // Stage 6: Determine status and create registration
    const isPaid = workshopResult.data.isPaid;
    const status = isPaid ? "PENDING_PAYMENT" : "CONFIRMED";

    const regResult = await this.registrationsRepo.create({
      studentId,
      workshopId: dto.workshop_id,
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    });
    if (regResult.isFailure) {
      await this.seatCounter.increment(dto.workshop_id);
      return Result.fail(regResult.error);
    }
    const registration = regResult.data;

    // Stage 7a: If paid — acquire seat lock
    const workshop = workshopResult.data;
    if (isPaid) {
      const lockResult = await this.seatLock.acquire(
        dto.workshop_id,
        registration.registrationId,
        studentId,
        Number(workshop.price)
      );
      if (lockResult.isFailure) {
        // Compensation: mark registration as CANCELLED, release seat
        await this.registrationsRepo.updateStatus(
          registration.registrationId,
          "CANCELLED"
        );
        await this.seatCounter.increment(dto.workshop_id);
        return Result.fail(lockResult.error);
      }
    }

    // Stage 7b: If free — issue ticket immediately
    if (!isPaid) {
      const ticketResult = await this.ticketsRepo.create({
        registrationId: registration.registrationId,
        qrToken: crypto.randomUUID(),
        status: "ACTIVE",
      });
      // Ticket failure is non-fatal for registration; log and continue
      if (ticketResult.isSuccess) {
        await this.ticketsService.signAndUpdateQrToken(
          ticketResult.data.ticketId,
          dto.workshop_id,
          studentId
        );
      }
    }

    // Stage 8: Build response
    const response = RegistrationResponseBuilder.from(registration, {
      payment_deadline: isPaid ? new Date(Date.now() + 900_000) : undefined,
      amount: isPaid ? Number(workshop.price) : undefined,
    });

    // Fire REGISTRATION_CONFIRMED for free workshops (fire-and-forget)
    if (!isPaid) {
      this.fireRegistrationEvent(
        registration.registrationId,
        studentId,
        dto.workshop_id,
        "registration.confirmed"
      );
    }

    return Result.ok(response);
  }

  /**
   * Lists a student's own registrations with workshop titles.
   *
   * IDOR is enforced at the repository layer — only registrations where
   * student_id matches the JWT subject are returned.
   *
   * @param studentId - The UUID of the student (from JWT).
   * @param query - Optional filters: status, page (default 1), limit (default 20).
   * @returns OkResult with paginated list of RegistrationDto items and total count.
   * - May return FailResult with INTERNAL_ERROR on database failure.
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
   * Returns REGISTRATION_NOT_FOUND for both missing registrations and
   * registrations owned by other students — no information leakage.
   *
   * @param studentId - The UUID of the student (from JWT).
   * @param registrationId - The UUID of the registration to retrieve.
   * @returns OkResult with RegistrationDto, or FailResult with codes:
   * - REGISTRATION_NOT_FOUND: Does not exist or belongs to another student.
   * - INTERNAL_ERROR: Unexpected database failure.
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

    const response = RegistrationResponseBuilder.from(result.data);
    return Result.ok(response);
  }

  /**
   * Cancels a student's own registration, releases the seat, and voids the ticket.
   *
   * Cancellation workflow:
   * 1. Find registration and verify ownership (IDOR).
   * 2. Reject if already cancelled.
   * 3. Update status to CANCELLED with timestamp.
   * 4. Void the associated ticket if one exists.
   * 5. Return the seat to the available pool (Redis INCR).
   * 6. Release the seat lock if the workshop was paid (idempotent).
   *
   * Business rules:
   * - Only CONFIRMED or PENDING_PAYMENT registrations can be cancelled.
   * - Already-cancelled registrations return REGISTRATION_CANCELLED.
   * - IDOR: returns REGISTRATION_NOT_FOUND for non-owned registrations.
   *
   * Side effects:
   * - Updates registration status to CANCELLED in the database.
   * - Updates ticket status to VOID in the database (if ticket exists).
   * - Increments seat:available:{workshopId} in Redis.
   * - Deletes seat:lock:{workshopId}:{registrationId} in Redis (if paid).
   *
   * @param studentId - The UUID of the student (from JWT).
   * @param registrationId - The UUID of the registration to cancel.
   * @returns OkResult with the updated RegistrationDto (status = CANCELLED),
   * or FailResult with codes:
   * - REGISTRATION_NOT_FOUND: Does not exist or belongs to another student.
   * - REGISTRATION_CANCELLED: Registration was already cancelled.
   * - INTERNAL_ERROR: Unexpected database or Redis failure.
   */
  async cancelRegistration(
    studentId: string,
    registrationId: string
  ): Promise<Result<RegistrationDto>> {
    // Find registration and verify ownership (IDOR)
    const result = await this.findByIdWithOwnershipCheck(
      registrationId,
      studentId
    );
    if (result.isFailure) return Result.fail(result.error);
    const registration = result.data;

    // Check if already cancelled
    if (registration.status === "CANCELLED") {
      return Result.fail(registrationErrors.alreadyCancelled(registrationId));
    }

    // Update status to CANCELLED
    const updateResult = await this.registrationsRepo.updateStatus(
      registrationId,
      "CANCELLED"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    // Parallel: void ticket + release seat + release lock (all idempotent)
    await Promise.all([
      this.ticketsRepo.updateStatusByRegistrationId(registrationId, "VOID"),
      this.seatCounter.increment(registration.workshopId),
      registration.status === "PENDING_PAYMENT"
        ? this.seatLock.release(registration.workshopId, registrationId)
        : Promise.resolve(),
    ]);

    const response = RegistrationResponseBuilder.from(updateResult.data);

    // Fire REGISTRATION_CANCELLED event (fire-and-forget)
    this.fireRegistrationEvent(
      registrationId,
      studentId,
      registration.workshopId,
      "registration.cancelled"
    );

    return Result.ok(response);
  }

  /**
   * Fires a registration domain event into the notification queue (fire-and-forget).
   *
   * Business rules:
   * - Fire-and-forget: queue failures are silently ignored per ADR-11.
   * - The notification worker dispatches the appropriate channel notifications
   *   (email, push, Telegram) based on the student's preferences.
   *
   * Side effects:
   * - Enqueues a BullMQ job into the notification queue.
   *
   * @param registrationId - UUID of the affected registration.
   * @param studentId - UUID of the student.
   * @param workshopId - UUID of the workshop.
   * @param eventType - 'registration.confirmed' or 'registration.cancelled'.
   */
  private fireRegistrationEvent(
    registrationId: string,
    studentId: string,
    workshopId: string,
    eventType: "registration.confirmed" | "registration.cancelled"
  ): void {
    const eventData: RegistrationEventData = {
      registrationId,
      studentId,
      workshopId,
      eventType,
    };
    this.notificationPublisher.fire(eventType, eventData);
  }

  /**
   * Finds a registration by ID and verifies it belongs to the given student.
   *
   * IDOR protection: returns the same error for missing and non-owned
   * registrations to prevent existence probing by unauthorized users.
   *
   * @param registrationId - The UUID of the registration.
   * @param studentId - The UUID of the student claiming ownership.
   * @returns OkResult with the Registration entity if owned by the student,
   * or FailResult with REGISTRATION_NOT_FOUND for both missing and non-owned records.
   */
  /**
   * Counts CONFIRMED registrations for a given workshop.
   *
   * Used by the background reconciliation cron to compute the confirmed
   * attendee count for workshop_slot counter correction.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the count, or FailResult (INTERNAL_ERROR).
   */
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
