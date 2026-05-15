/**
 * Payments Service
 *
 * Core orchestrator for the payment lifecycle. Implements a 5-stage pipeline
 * for payment initiation and ACID-transaction webhook processing.
 *
 * Initiation pipeline:
 * 1. Idempotency lookup (read-only) — replay COMPLETED, reject IN_PROGRESS without claiming key.
 * 2. Circuit breaker check — reject BEFORE claiming any new key (INV-04).
 * 3. Idempotency claim — INSERT IN_PROGRESS for new keys; no-op for UNRESOLVED.
 * 4. Registration lookup + IDOR verification.
 * 5. Seat lock TTL check + workshop price lookup (parallel).
 * 6. Payment INSERT — with timeout_at = 15 minutes.
 * 7. Gateway adapter call — MOCK returns fake redirect URL.
 * 8. Finalize idempotency key and record CB outcome.
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
import { Injectable } from "@nestjs/common";

import type { Payment } from "@/infra/database/types/transaction.types";
import { PAYMENT_WINDOW_SECONDS } from "@/modules/booking/mechanics/seat-lock.mechanic";
import { SeatLockMechanic } from "@/modules/booking/mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "@/modules/booking/repositories/registrations.repository";
import { SeatCounterService } from "@/modules/catalog/services/seat-counter.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";
import {
  passthroughOrInternal,
  paymentErrors,
  registrationErrors,
} from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

import { PaymentGatewayService } from "./payment-gateway.service";
import { PaymentResponseBuilder } from "../dto/payment-response.dto";
import { CircuitBreakerMechanic } from "../mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "../mechanics/idempotency.mechanic";
import { PaymentsRepository } from "../repositories/payments.repository";

import type { CreatePaymentDto } from "../dto/create-payment.dto";
import type {
  CreatePaymentResponseDto,
  PaymentResponseDto,
} from "../dto/payment-response.dto";
import type {
  PaymentWebhookDto,
  PaymentWebhookDtoType,
} from "../dto/payment-webhook.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly registrationsRepo: RegistrationsRepository,
    private readonly seatLock: SeatLockMechanic,
    private readonly idempotencyMechanic: IdempotencyMechanic,
    private readonly circuitBreaker: CircuitBreakerMechanic,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly workshopsService: WorkshopsService,
    private readonly seatCounter: SeatCounterService,
    private readonly notificationLogProducer: NotificationLogProducer
  ) {}

  /**
   * Initiates a payment through the 7-stage pipeline.
   *
   * Pipeline stages:
   * 1. Idempotency lookup (read-only) — replay COMPLETED, reject IN_PROGRESS without claiming key.
   * 2. Circuit breaker check — reject BEFORE claiming any new idempotency key (INV-04).
   * 3. Idempotency claim — INSERT IN_PROGRESS for new keys; no-op for UNRESOLVED.
   * 4. Registration lookup + IDOR verification — must be student's own PENDING registration.
   * 5. Seat lock TTL check + workshop price lookup (parallel).
   * 6. Payment INSERT with 15-minute timeout.
   * 7. Gateway adapter call (MOCK returns fake redirect URL).
   * 8. MOCK auto-resolve — call handleWebhook internally (no real webhook will fire for MOCK).
   * 9. On gateway success: mark idempotency COMPLETED + record CB success.
   *    On gateway failure: mark idempotency UNRESOLVED + record CB failure.
   *
   * Business rules:
   * - Idempotency lookup MUST precede circuit breaker to replay COMPLETED results
   *   even when CB is OPEN (AC-05), and to detect IN_PROGRESS conflicts early.
   * - Circuit breaker check MUST precede idempotency claim so CB OPEN never creates
   *   a stuck IN_PROGRESS key that blocks retries for 30 seconds (INV-04).
   * - Registration must have PENDING status (set during free/paid workshop registration).
   *
   * Side effects:
   * - Inserts a payment record with INITIATED status.
   * - Creates idempotency_keys row with IN_PROGRESS (or updates to COMPLETED/UNRESOLVED).
   * - Reads/writes circuit breaker state in Redis.
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param dto - CreatePaymentDto with registration_id and gateway.
   * @param idempotencyKey - The X-Idempotency-Key header value.
   * @returns OkResult with CreatePaymentResponseDto (includes redirectUrl, deadline, and status),
   * or FailResult with codes:
   * - IDEMPOTENCY_CONFLICT: Another request with this key is in progress.
   * - PAYMENT_GATEWAY_OPEN: Circuit breaker is OPEN.
   * - REGISTRATION_NOT_FOUND: Registration missing or wrong student/status.
   * - SEAT_LOCK_EXPIRED: Seat hold has expired.
   * - DB_LOCK_TIMEOUT: Database contention.
   * - INTERNAL_ERROR: Unexpected failure.
   */
  async initiate(
    studentId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string
  ): Promise<Result<CreatePaymentResponseDto>> {
    // Stage 1: Idempotency lookup — read-only, no INSERT (INV-04: must precede CB check)
    const lookupResult =
      await this.idempotencyMechanic.lookupExisting(idempotencyKey);
    if (lookupResult.isFailure) return Result.fail(lookupResult.error);
    if (lookupResult.data.found && !lookupResult.data.proceed) {
      // COMPLETED — replay cached response (AC-05: survives CB OPEN)
      return Result.ok(
        lookupResult.data.cachedResponse!.body as CreatePaymentResponseDto
      );
    }
    // Not found or UNRESOLVED — fall through to CB check

    // Stage 2: Circuit breaker — reject BEFORE claiming any new key (INV-04)
    const cbResult = await this.circuitBreaker.checkAndAllow(dto.gateway);
    if (cbResult.isFailure) return Result.fail(cbResult.error);

    // Stage 3: Claim idempotency key (INSERT IN_PROGRESS for new; no-op for UNRESOLVED)
    const idemResult = await this.idempotencyMechanic.check(
      idempotencyKey,
      "PAYMENT"
    );
    if (idemResult.isFailure) return Result.fail(idemResult.error);

    // Stage 4: Registration lookup + IDOR
    const regResult = await this.registrationsRepo.findById(dto.registrationId);
    if (regResult.isFailure) return Result.fail(regResult.error);
    const registration = regResult.data;
    if (
      !registration ||
      registration.studentId !== studentId ||
      registration.status !== "PENDING"
    ) {
      return Result.fail(paymentErrors.notFound(dto.registrationId));
    }

    // Stage 5: Seat lock check + workshop price (parallel — both need workshopId)
    const [lockResult, workshopResult] = await Promise.all([
      this.seatLock.check(registration.workshopId, registration.registrationId),
      this.workshopsService.getPublishedById(registration.workshopId),
    ]);
    if (lockResult.isFailure) return Result.fail(lockResult.error);
    if (workshopResult.isFailure) return Result.fail(workshopResult.error);
    const amount = Number(workshopResult.data.price);

    // Stage 6: Insert payment record
    const payResult = await tryCatch(async () => {
      return this.paymentsRepo.transaction(async (tx) => {
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
      await this.idempotencyMechanic.markUnresolved(idempotencyKey);
      return Result.fail(gwResult.error);
    }

    // Stage 8: MOCK auto-resolve — no real webhook will fire for mock gateway
    let resolvedStatus: "INITIATED" | "SUCCEEDED" = "INITIATED";
    if (dto.gateway === "MOCK") {
      const mockWebhook: PaymentWebhookDtoType = {
        gatewayTxnId: gwResult.data.gatewayTxnId,
        status: "SUCCESS",
        idempotencyKey,
      };
      const mockResult = await this.handleWebhook(
        "MOCK",
        mockWebhook as PaymentWebhookDto
      );
      if (mockResult.isSuccess) {
        resolvedStatus = "SUCCEEDED";
      }
    }

    // Stage 9: Mark idempotency completed + record CB success
    const responseDto = PaymentResponseBuilder.fromCreate(
      payment,
      gwResult.data.redirectUrl,
      payment.timeoutAt!,
      resolvedStatus
    );
    await this.idempotencyMechanic.markCompleted(
      idempotencyKey,
      responseDto,
      201
    );
    await this.circuitBreaker.recordSuccess(dto.gateway);

    return Result.ok(responseDto);
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
          webhookDto.idempotencyKey,
          tx
        );
        if (payResult.isFailure) throw payResult.error;
        if (!payResult.data) {
          throw paymentErrors.notFound(webhookDto.idempotencyKey);
        }

        const payment = payResult.data;

        // Idempotent webhook: already processed (checked after lock)
        if (payment.status === "SUCCEEDED") {
          throw paymentErrors.alreadySuccess(payment.paymentId);
        }

        const registrationId = payment.registrationId;

        let workshopId: string;

        if (webhookDto.status === "SUCCESS") {
          // Success path: update payment + registration + create ticket
          const payUpdate = await this.paymentsRepo.updateStatus(
            payment.paymentId,
            "SUCCEEDED",
            webhookDto.gatewayTxnId,
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
        } else {
          // Failure path: update payment to FAILED only
          const payUpdate = await this.paymentsRepo.updateStatus(
            payment.paymentId,
            "FAILED",
            undefined,
            tx
          );
          if (payUpdate.isFailure) throw payUpdate.error;

          // Read registration for workshopId — fail visibly instead
          // of silently passing an empty workshopId downstream.
          const reg = await this.registrationsRepo.findById(registrationId);
          if (reg.isFailure) throw reg.error;
          if (!reg.data) throw registrationErrors.notFound(registrationId);
          workshopId = reg.data.workshopId;
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

    // Post-transaction: Create notification log for completed payment
    if (isSuccess) {
      void this.notificationLogProducer.createAndEnqueue({
        userId: payment.studentId,
        workshopId,
        type: "REGISTRATION_CONFIRMED",
        payload: {
          registrationId: payment.registrationId,
          paymentId: payment.paymentId,
        },
      });
    }

    return Result.ok();
  }

  /**
   * Lists the authenticated student's payments with cursor-based pagination.
   *
   * IDOR is enforced at the repository layer — only payments where
   * student_id matches the JWT subject are returned.
   *
   * @param studentId - The UUID of the student (from JWT, never from request body).
   * @param query - Optional cursor and limit (default 20).
   * @returns OkResult with { items, nextCursor, hasMore, limit },
   * or FailResult with INTERNAL_ERROR.
   */
  async getMyPayments(
    studentId: string,
    query?: { cursor?: string; limit?: number }
  ): Promise<
    Result<{
      items: PaymentResponseDto[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    const result = await this.paymentsRepo.findMyPayments(studentId, {
      cursor: query?.cursor,
      limit: query?.limit,
    });
    if (result.isFailure) return Result.fail(result.error);

    const items = result.data.items.map((item) =>
      PaymentResponseBuilder.from(item)
    );

    return Result.ok({
      items,
      nextCursor: result.data.nextCursor,
      hasMore: result.data.hasMore,
      limit: result.data.limit,
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
    if (payResult.data.status === "SUCCEEDED") {
      return Result.fail(paymentErrors.alreadySuccess(paymentId));
    }
    // Already in a terminal state (FAILED, UNRESOLVED) — no-op
    if (payResult.data.status !== "INITIATED") {
      return Result.ok();
    }

    const payment = payResult.data;
    const registrationId = payment.registrationId;

    // ACID transaction
    const txResult = await tryCatch(async () => {
      return this.paymentsRepo.transaction(async (tx) => {
        const payUpdate = await this.paymentsRepo.updateStatus(
          paymentId,
          "FAILED",
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
      await this.workshopsService.incrementSeat(workshopId);
      await this.seatCounter.invalidateCache(workshopId);
    }

    // Create notification log for payment outcome (fire-and-forget)
    void this.notificationLogProducer.createAndEnqueue({
      userId: payment.studentId,
      workshopId,
      type:
        eventType === "payment.success" ? "PAYMENT_SUCCESS" : "PAYMENT_FAILED",
      payload: {
        paymentId: payment.paymentId,
        registrationId,
        amount: Number(payment.amount),
        gateway: payment.gateway,
      },
    });
  }

  /**
   * Returns the count of PENDING payments.
   */
  async countPending(): Promise<Result<number>> {
    return this.paymentsRepo.countPending();
  }

  /**
   * Returns the count of overdue (PENDING + past timeout) payments.
   */
  async countOverdue(): Promise<Result<number>> {
    const result = await this.paymentsRepo.findPendingOverdue();
    if (result.isFailure) return Result.fail(result.error);
    return Result.ok(result.data.length);
  }
}
