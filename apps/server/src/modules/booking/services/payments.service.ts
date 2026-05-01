/**
 * Payments Service
 *
 * Core orchestrator for the payment lifecycle. Implements a 5-stage pipeline
 * for payment initiation and ACID-transaction webhook processing.
 *
 * Initiation pipeline:
 * 1. Seat lock TTL check — verify the 15-minute hold is still valid.
 * 2. Idempotency Layer 1 — Redis SET NX guards against duplicate submissions.
 * 3. Circuit breaker — reject early if the gateway is failing.
 * 4. Payment INSERT — with timeout_at = 15 minutes.
 * 5. Gateway adapter call — MOCK returns fake redirect URL.
 *
 * Webhook processing:
 * - SUCCESS: ACID transaction (payment→SUCCESS, registration→CONFIRMED,
 *   ticket→ACTIVE), then release seat lock + fire event.
 * - FAILED: mark payment FAILED, release seat lock + increment counter + fire event.
 *
 * Cross-module communication:
 * - CatalogModule → WorkshopsService, SeatCounterService (Service-to-Service only).
 *
 * Business rules:
 * - IDOR enforced: student_id always from JWT, never from request body.
 * - Event emission is fire-and-forget (non-blocking, ADR-11).
 * - DB UNIQUE constraint on idempotency_key is Layer 2 fallback.
 *
 * Side effects:
 * - Inserts/updates payments, registrations, tickets in PostgreSQL.
 * - Creates/reads/deletes Redis keys (idempotency, circuit breaker, seat lock).
 * - Enqueues BullMQ notification events (fire-and-forget).
 */
import crypto from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NOTIFICATION_QUEUE } from "@/shared/queues/queue.constants";
import { passthroughOrInternal, paymentErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

import { PaymentGatewayService } from "./payment-gateway.service";
import { PAYMENT_WINDOW_SECONDS } from "../mechanics/seat-lock.mechanic";

import { PaymentResponseBuilder } from "../dto/payment-response.dto";
import { CircuitBreakerMechanic } from "../mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "../mechanics/idempotency.mechanic";
import { SeatLockMechanic } from "../mechanics/seat-lock.mechanic";
import { PaymentsRepository } from "../repositories/payments.repository";
import { RegistrationsRepository } from "../repositories/registrations.repository";
import { TicketsRepository } from "../repositories/tickets.repository";

import type { Payment } from "@/database/types/transaction.types";
import type { PaymentEventData } from "@/shared/queues/event-contracts";
import type { CreatePaymentDto } from "../dto/create-payment.dto";
import type {
  CreatePaymentResponseDto,
  PaymentResponseDto,
} from "../dto/payment-response.dto";
import type { PaymentWebhookDto } from "../dto/payment-webhook.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly ticketsRepo: TicketsRepository,
    private readonly seatLock: SeatLockMechanic,
    private readonly idempotencyMechanic: IdempotencyMechanic,
    private readonly circuitBreaker: CircuitBreakerMechanic,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly workshopsService: WorkshopsService,
    private readonly seatCounter: SeatCounterService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue
  ) {}

  /**
   * Initiates a payment through the 5-stage pipeline.
   *
   * Pipeline stages:
   * 1. Registration lookup + IDOR verification (must be student's own registration).
   * 2. Seat lock TTL check (must still be valid).
   * 3. Idempotency Layer 1 (Redis SET NX — rejects duplicates with existing
   *    payment_id).
   * 4. Circuit breaker check (rejects if gateway is OPEN with PAYMENT_GATEWAY_OPEN).
   * 5. Workshop price lookup (for amount).
   * 6. Payment INSERT with 15-minute timeout.
   * 7. Gateway adapter call (MOCK returns fake redirect URL).
   * 8. On gateway success: record circuit breaker success + update idempotency key.
   *    On gateway failure: record circuit breaker failure + return error.
   *
   * Business rules:
   * - Registration must have PENDING_PAYMENT status.
   * - Sequential pipeline: idempotency MUST be checked before circuit breaker
   *   to avoid counting duplicates as gateway failures.
   * - Seat lock check happens after IDOR to avoid unnecessary Redis reads.
   *
   * Side effects:
   * - Inserts a payment record with PENDING status.
   * - Creates idempotency key in Redis (or updates from placeholder to payment_id).
   * - Reads/writes circuit breaker state in Redis.
   *
   * @param studentId - The UUID of the authenticated student (from JWT).
   * @param dto - CreatePaymentDto with registration_id and gateway.
   * @param idempotencyKey - The X-Idempotency-Key header value.
   * @returns OkResult with CreatePaymentResponseDto (includes redirect_url and deadline),
   * or FailResult with codes:
   * - PAYMENT_DUPLICATE: Idempotency key already exists.
   * - PAYMENT_GATEWAY_OPEN: Circuit breaker is OPEN.
   * - SEAT_LOCK_EXPIRED: Seat hold has expired.
   * - REGISTRATION_NOT_FOUND: Registration missing or wrong student/status.
   * - DB_LOCK_TIMEOUT: Database contention.
   * - INTERNAL_ERROR: Unexpected failure.
   */
  async initiate(
    studentId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string
  ): Promise<Result<CreatePaymentResponseDto>> {
    // Stage 1: Registration lookup + IDOR
    const regResult = await this.registrationsRepo.findById(
      dto.registration_id
    );
    if (regResult.isFailure) return Result.fail(regResult.error);
    const registration = regResult.data;
    if (
      !registration ||
      registration.studentId !== studentId ||
      registration.status !== "PENDING_PAYMENT"
    ) {
      return Result.fail(paymentErrors.notFound(dto.registration_id));
    }

    // Stages 2-5: Parallel independent I/O
    const [lockResult, idemResult, workshopResult] = await Promise.all([
      this.seatLock.check(registration.workshopId, registration.registrationId),
      this.idempotencyMechanic.check(idempotencyKey),
      this.workshopsService.getPublishedById(registration.workshopId),
    ]);
    if (lockResult.isFailure) return Result.fail(lockResult.error);

    // Stage 3b: Idempotency duplicate detection
    if (idemResult.isFailure) return Result.fail(idemResult.error);
    if (!idemResult.data.proceed) {
      return Result.fail(
        paymentErrors.duplicate(
          idempotencyKey,
          idemResult.data.existingPaymentId!
        )
      );
    }

    // Stage 4: Workshop price (from parallel batch)
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const amount = Number(workshopResult.data.price);

    // Stage 5: Circuit breaker (sequential — must run after idempotency)
    const cbResult = await this.circuitBreaker.checkAndAllow(dto.gateway);
    if (cbResult.isFailure) return Result.fail(cbResult.error);

    // Stage 6: Insert payment record with FOR UPDATE NOWAIT on workshop_slots
    const payResult = await tryCatch(async () => {
      return this.paymentsRepo.transaction(async (tx) => {
        // Pessimistic lock on workshop_slots (fails fast if locked)
        const lockResult = await this.paymentsRepo.lockWorkshopSlot(
          registration.workshopId,
          tx
        );
        if (lockResult.isFailure) throw lockResult.error;

        const createResult = await this.paymentsRepo.create(
          {
            registrationId: registration.registrationId,
            studentId,
            amount: String(amount),
            currency: "VND",
            gateway: dto.gateway,
            idempotencyKey,
            timeoutAt: new Date(Date.now() + PAYMENT_WINDOW_SECONDS * 1000),
          },
          tx
        );
        if (createResult.isFailure) throw createResult.error;
        return createResult.data;
      });
    }, passthroughOrInternal);
    if (payResult.isFailure) return Result.fail(payResult.error);
    const payment = payResult.data;

    // Stage 7: Gateway adapter call
    const gwResult = await this.paymentGatewayService.initiatePayment(
      dto.gateway,
      amount,
      { registration_id: registration.registrationId }
    );

    if (gwResult.isFailure) {
      await this.circuitBreaker.recordFailure(dto.gateway);
      return Result.fail(gwResult.error);
    }

    // Stage 8: Post-gateway success
    await this.circuitBreaker.recordSuccess(dto.gateway);
    await this.idempotencyMechanic.setPaymentId(
      idempotencyKey,
      payment.paymentId
    );

    return Result.ok(
      PaymentResponseBuilder.fromCreate(
        payment,
        gwResult.data.redirect_url,
        payment.timeoutAt!
      )
    );
  }

  /**
   * Processes a payment webhook from an external gateway.
   *
   * Uses a single ACID transaction with FOR UPDATE NOWAIT on the payment row
   * to serialize concurrent webhook calls — the second caller sees the updated
   * status and returns PAYMENT_ALREADY_SUCCESS.
   *
   * Transaction steps (success path):
   * 1. Lock payment row (FOR UPDATE NOWAIT — fails fast if row is locked).
   * 2. Payment → SUCCESS (with gateway_txn_id and completed_at).
   * 3. Registration → CONFIRMED (with confirmed_at).
   * 4. Ticket → ACTIVE (with unique QR token).
   *
   * Transaction steps (failure path):
   * 1. Lock payment row.
   * 2. Payment → FAILED (with completed_at).
   *
   * Post-transaction (outside DB transaction, for both success and failure):
   * 5. Delete seat lock from Redis (idempotent).
   * 6. Increment available seat counter.
   * 7. Fire PAYMENT_SUCCESS or PAYMENT_FAILED event (fire-and-forget, ADR-11).
   *
   * Business rules:
   * - Idempotent: already-SUCCESS payments return PAYMENT_ALREADY_SUCCESS
   *   (detected after acquiring the lock to prevent races).
   * - Non-existent payments return PAYMENT_NOT_FOUND.
   * - Registration stays PENDING_PAYMENT on failure (student can retry).
   * - All DB steps commit atomically or roll back entirely.
   * - Event emission is non-blocking — notification latency does not delay
   *   the webhook response.
   *
   * Side effects:
   * - Updates payment, registration rows; inserts ticket row in DB.
   * - Deletes Redis key seat:lock:{workshopId}:{registrationId}.
   * - Increments seat:available:{workshopId} in Redis.
   * - Enqueues BullMQ notification event (fire-and-forget).
   *
   * @param _gateway - The payment gateway identifier (validated by HmacSignatureGuard).
   * @param webhookDto - Parsed webhook payload with status, txn_id, idempotency_key.
   * @returns OkResult(void) on success, or FailResult with codes:
   * - PAYMENT_NOT_FOUND: No payment for this idempotency key.
   * - PAYMENT_ALREADY_SUCCESS: Already processed.
   * - DB_LOCK_TIMEOUT: Payment row is locked by another webhook.
   * - INTERNAL_ERROR: Unexpected failure.
   */
  async handleWebhook(
    _gateway: string,
    webhookDto: PaymentWebhookDto
  ): Promise<Result<void>> {
    // ACID transaction with FOR UPDATE NOWAIT for webhook serialization
    const txResult = await tryCatch(async () => {
      return this.paymentsRepo.transaction(async (tx) => {
        // Lock payment row with FOR UPDATE NOWAIT to serialize concurrent webhooks
        const payResult = await this.paymentsRepo.findByIdempotencyKeyWithLock(
          webhookDto.idempotency_key,
          tx
        );
        if (payResult.isFailure) throw payResult.error;
        if (!payResult.data) {
          throw paymentErrors.notFound(webhookDto.idempotency_key);
        }

        const payment = payResult.data;

        // Idempotent webhook: already processed (checked after lock)
        if (payment.status === "SUCCESS") {
          throw paymentErrors.alreadySuccess(payment.paymentId);
        }

        const registrationId = payment.registrationId;

        let workshopId: string;

        if (webhookDto.status === "SUCCESS") {
          // Success path: update payment + registration + create ticket
          const payUpdate = await this.paymentsRepo.updateStatus(
            payment.paymentId,
            "SUCCESS",
            webhookDto.gateway_txn_id,
            tx
          );
          if (payUpdate.isFailure) throw payUpdate.error;

          const regUpdate = await this.registrationsRepo.updateStatus(
            registrationId,
            "CONFIRMED",
            tx
          );
          if (regUpdate.isFailure) throw regUpdate.error;
          workshopId = regUpdate.data.workshopId;

          const ticketCreate = await this.ticketsRepo.create(
            {
              registrationId,
              qrToken: crypto.randomUUID(),
              status: "ACTIVE",
            },
            tx
          );
          if (ticketCreate.isFailure) throw ticketCreate.error;
        } else {
          // Failure path: update payment to FAILED only
          const payUpdate = await this.paymentsRepo.updateStatus(
            payment.paymentId,
            "FAILED",
            undefined,
            tx
          );
          if (payUpdate.isFailure) throw payUpdate.error;

          // Read registration for workshopId (not part of write tx)
          const reg = await this.registrationsRepo.findById(registrationId);
          workshopId = reg.isSuccess && reg.data ? reg.data.workshopId : "";
        }

        // Return data for post-transaction operations
        return {
          payment,
          workshopId,
          isSuccess: webhookDto.status === "SUCCESS",
        };
      });
    }, passthroughOrInternal);

    if (txResult.isFailure) return Result.fail(txResult.error);

    // Post-transaction: Redis + event (fire-and-forget)
    const { payment, workshopId, isSuccess } = txResult.data;
    await this.releaseSeatLockAndFireEvent(
      payment.registrationId,
      workshopId,
      payment,
      isSuccess ? "payment.success" : "payment.failed",
      !isSuccess
    );

    return Result.ok();
  }

  /**
   * Lists the authenticated student's payments with pagination.
   *
   * IDOR is enforced at the repository layer — only payments where
   * student_id matches the JWT subject are returned.
   *
   * @param studentId - The UUID of the student (from JWT, never from request body).
   * @param query - Optional pagination: page (default 1), limit (default 20).
   * @returns OkResult with paginated PaymentResponseDto list and total count,
   * or FailResult with INTERNAL_ERROR.
   */
  async getMyPayments(
    studentId: string,
    query?: { page?: number; limit?: number }
  ): Promise<
    Result<{
      items: PaymentResponseDto[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    const result = await this.paymentsRepo.findMyPayments(studentId, {
      page: query?.page,
      limit: query?.limit,
    });
    if (result.isFailure) return Result.fail(result.error);

    const items = result.data.items.map((item) =>
      PaymentResponseBuilder.from(item)
    );

    return Result.ok({
      items,
      total: result.data.total,
      page: query?.page ?? 1,
      limit: query?.limit ?? 20,
    });
  }

  /**
   * Retrieves a single payment's detail with IDOR enforcement.
   *
   * Returns PAYMENT_NOT_FOUND for both missing payments and payments
   * owned by other students — no information leakage.
   *
   * @param studentId - The UUID of the student (from JWT).
   * @param paymentId - The UUID of the payment to retrieve.
   * @returns OkResult with PaymentResponseDto, or FailResult with codes:
   * - PAYMENT_NOT_FOUND: Does not exist or belongs to another student.
   * - INTERNAL_ERROR: Unexpected database failure.
   */
  async getPaymentDetail(
    studentId: string,
    paymentId: string
  ): Promise<Result<PaymentResponseDto>> {
    const result = await this.paymentsRepo.findById(paymentId);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data || result.data.studentId !== studentId) {
      return Result.fail(paymentErrors.notFound(paymentId));
    }
    return Result.ok(PaymentResponseBuilder.from(result.data));
  }

  /**
   * Expires an overdue PENDING payment.
   *
   * W4 contract: called by PaymentTimeoutCron background job.
   *
   * ACID transaction:
   * 1. Payment → TIMEOUT (with completed_at).
   * 2. Registration → CANCELLED (with cancelled_at).
   *
   * Post-transaction (outside DB transaction):
   * 3. Increment available seat counter.
   * 4. Delete seat lock from Redis.
   * 5. Fire PAYMENT_FAILED event (fire-and-forget).
   *
   * Business rules:
   * - Only PENDING payments can be expired.
   * - Registration status becomes CANCELLED, releasing the seat.
   * - ALREADY_SUCCESS returns an error — do not expire a confirmed payment.
   * - Already FAILED/TIMEOUT/REFUNDED is a no-op (seat already released).
   *
   * Side effects:
   * - Updates payment row to TIMEOUT.
   * - Updates registration row to CANCELLED.
   * - Increments seat:available:{workshopId} in Redis.
   * - Deletes Redis key seat:lock:{workshopId}:{registrationId}.
   * - Enqueues PAYMENT_FAILED notification event.
   *
   * @param paymentId - The UUID of the payment to expire.
   * @returns OkResult(void) on success, or FailResult with codes:
   * - PAYMENT_NOT_FOUND: Payment does not exist.
   * - PAYMENT_ALREADY_SUCCESS: Payment is already confirmed (not expired).
   * - INTERNAL_ERROR: Unexpected failure.
   */
  async expirePayment(paymentId: string): Promise<Result<void>> {
    const payResult = await this.paymentsRepo.findById(paymentId);
    if (payResult.isFailure) return Result.fail(payResult.error);
    if (!payResult.data) {
      return Result.fail(paymentErrors.notFound(paymentId));
    }
    // SUCCESS must not be expired
    if (payResult.data.status === "SUCCESS") {
      return Result.fail(paymentErrors.alreadySuccess(paymentId));
    }
    // Already in a terminal state (FAILED, TIMEOUT, REFUNDED) — no-op
    if (payResult.data.status !== "PENDING") {
      return Result.ok();
    }

    const payment = payResult.data;
    const registrationId = payment.registrationId;

    // ACID transaction
    const txResult = await tryCatch(async () => {
      return this.paymentsRepo.transaction(async (tx) => {
        const payUpdate = await this.paymentsRepo.updateStatus(
          paymentId,
          "TIMEOUT",
          undefined,
          tx
        );
        if (payUpdate.isFailure) throw payUpdate.error;

        const regUpdate = await this.registrationsRepo.updateStatus(
          registrationId,
          "CANCELLED",
          tx
        );
        if (regUpdate.isFailure) throw regUpdate.error;

        return { workshopId: regUpdate.data.workshopId };
      });
    }, passthroughOrInternal);

    if (txResult.isFailure) return Result.fail(txResult.error);

    // Post-transaction: Redis + event
    await this.releaseSeatLockAndFireEvent(
      registrationId,
      txResult.data.workshopId,
      payment,
      "payment.failed",
      true
    );

    return Result.ok();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Releases the seat lock, conditionally increments the seat counter,
   * and fires a notification event — all post-transaction operations
   * that must not be rolled back if they fail.
   *
   * Business rules:
   * - Seat counter is only incremented on failure/timeout paths (seat released
   *   back to pool). On success, the seat is consumed — counter stays unchanged.
   * - Event emission is fire-and-forget (non-blocking, ADR-11).
   *
   * Side effects:
   * - Deletes Redis key seat:lock:{workshopId}:{registrationId}.
   * - Optionally increments seat:available:{workshopId} in Redis.
   * - Enqueues a BullMQ notification event (fire-and-forget).
   *
   * @param registrationId - The UUID of the registration.
   * @param workshopId - The UUID of the workshop (pre-loaded by caller).
   * @param payment - The Payment entity (for event payload).
   * @param eventType - 'payment.success' or 'payment.failed'.
   * @param incrementSeatCounter - Whether to increment the available seat counter.
   */
  private async releaseSeatLockAndFireEvent(
    registrationId: string,
    workshopId: string,
    payment: Payment,
    eventType: "payment.success" | "payment.failed",
    incrementSeatCounter: boolean
  ): Promise<void> {
    // Release seat lock (idempotent — safe even if already expired)
    await this.seatLock.release(workshopId, registrationId);

    // Only return seat to pool on failure/timeout, not on successful payment
    if (incrementSeatCounter) {
      await this.seatCounter.increment(workshopId);
    }

    // Fire-and-forget: notification latency must not block webhook response
    const eventData: PaymentEventData = {
      paymentId: payment.paymentId,
      registrationId,
      studentId: payment.studentId,
      workshopId,
      amount: Number(payment.amount),
      gateway: payment.gateway as PaymentEventData["gateway"],
      eventType,
    };

    this.notificationQueue.add(eventType, eventData).catch(() => {
      // Silently ignore queue failures per ADR-11
    });
  }
}
