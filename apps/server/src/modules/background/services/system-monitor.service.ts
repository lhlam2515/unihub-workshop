/**
 * SystemMonitorService
 *
 * Provides system health monitoring for background jobs.
 * Queries and reports on payment timeout status, seat reconciliation,
 * and circuit breaker states for all payment gateways.
 *
 * All methods return Result<T, AppError> following the project's
 * Railway Oriented Programming pattern.
 */
import { Injectable } from "@nestjs/common";

import { PaymentsService } from "@/modules/booking/services/payments.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { RedisService } from "@/shared/redis/redis.service";
import { systemErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type {
  CircuitBreakerStatusArrayDto,
  CircuitBreakerStatusDto,
  PaymentTimeoutJobStatusDto,
  ReconciliationJobStatusDto,
} from "../dto/system-monitor-response.dto";

/** Known payment gateways managed by the circuit breaker system. */
const KNOWN_GATEWAYS = ["VNPAY", "MOMO", "STRIPE"] as const;

/** Redis key prefix for circuit breaker state hashes. */
const CIRCUIT_KEY_PREFIX = "circuit:payment";

/** Maximum allowed seat-counter discrepancy before flagging as an issue. */
const DISCREPANCY_THRESHOLD = 5;

@Injectable()
export class SystemMonitorService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly workshopsService: WorkshopsService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Returns the current status of the payment timeout cron job.
   *
   * Queries PostgreSQL for PENDING payment counts and overdue counts,
   * providing visibility into the payment timeout backlog.
   *
   * @returns OkResult with payment timeout job status, or FailResult with INTERNAL_ERROR.
   */
  async getPaymentTimeoutJobStatus(): Promise<
    Result<PaymentTimeoutJobStatusDto>
  > {
    const pendingResult = await this.paymentsService.countPending();
    if (pendingResult.isFailure) return Result.fail(pendingResult.error);

    const overdueResult = await this.paymentsService.countOverdue();
    if (overdueResult.isFailure) return Result.fail(overdueResult.error);

    const now = new Date();
    const nextRun = new Date(now.getTime() + 60_000);
    const paymentLastRunStr = await this.redisService.get(
      "cron:last_run:payment-timeout"
    );
    const paymentLastRun = paymentLastRunStr
      ? new Date(paymentLastRunStr)
      : now;

    return Result.ok({
      pending_count: pendingResult.data,
      timeout_count: overdueResult.data,
      last_run: paymentLastRun,
      next_run: nextRun,
      job_status: "IDLE",
    });
  }

  /**
   * Returns the current status of the seat reconciliation cron job.
   *
   * Checks all PUBLISHED workshops and compares Redis seat counters against
   * DB expected values. Reports the number of workshops checked and how
   * many have significant discrepancies.
   *
   * @returns OkResult with reconciliation job status, or FailResult with INTERNAL_ERROR.
   */
  async getReconciliationJobStatus(): Promise<
    Result<ReconciliationJobStatusDto>
  > {
    const workshopsResult =
      await this.workshopsService.getPublishedWorkshopsBasic();
    if (workshopsResult.isFailure) return Result.fail(workshopsResult.error);

    const workshops = workshopsResult.data;
    let discrepanciesFound = 0;

    for (const workshop of workshops) {
      const key = `seat:available:${workshop.workshopId}`;
      const redisValueStr = await this.redisService.get(key);
      const redisValue = redisValueStr
        ? parseInt(redisValueStr, 10)
        : Number(workshop.capacity);

      const slotResult = await this.workshopsService.getSlotByWorkshopId(
        workshop.workshopId
      );
      if (slotResult.isFailure) continue;

      const slot = slotResult.data;
      const confirmedCount = slot?.confirmedCount ?? 0;
      const lockedCount = slot?.lockedCount ?? 0;
      const expectedValue =
        Number(workshop.capacity) - confirmedCount - lockedCount;

      if (Math.abs(redisValue - expectedValue) > DISCREPANCY_THRESHOLD) {
        discrepanciesFound++;
      }
    }

    const now = new Date();
    const nextRun = new Date(now.getTime() + 600_000);
    const reconLastRunStr = await this.redisService.get(
      "cron:last_run:reconciliation"
    );
    const reconLastRun = reconLastRunStr ? new Date(reconLastRunStr) : now;

    return Result.ok({
      total_workshops: workshops.length,
      discrepancies_found: discrepanciesFound,
      last_run: reconLastRun,
      next_run: nextRun,
    });
  }

  /**
   * Returns the current circuit breaker state for all known payment gateways.
   *
   * Reads the Redis Hash `circuit:payment:{gateway}` for each gateway and
   * extracts state, failure_count, timestamps, and computes recovery deadlines.
   *
   * @returns OkResult with an array of circuit breaker statuses, or FailResult with INTERNAL_ERROR.
   */
  async getCircuitBreakerStatus(): Promise<
    Result<CircuitBreakerStatusArrayDto>
  > {
    try {
      const statuses: CircuitBreakerStatusDto[] = [];

      for (const gateway of KNOWN_GATEWAYS) {
        const key = `${CIRCUIT_KEY_PREFIX}:${gateway}`;
        const state = await this.redisService.hGetAll(key);

        const currentState = (state.state ??
          "CLOSED") as CircuitBreakerStatusDto["state"];
        const failureCount = state.failure_count
          ? parseInt(state.failure_count, 10)
          : 0;
        const openedAt = state.opened_at
          ? new Date(state.opened_at)
          : undefined;
        const lastAttempt = state.last_attempt
          ? new Date(state.last_attempt)
          : undefined;

        let recoveryDeadline: Date | undefined;
        if (openedAt && currentState === "OPEN") {
          recoveryDeadline = new Date(openedAt.getTime() + 30_000);
        }

        statuses.push({
          gateway: gateway,
          state: currentState,
          failure_count: failureCount,
          opened_at: openedAt,
          last_attempt: lastAttempt,
          recovery_deadline: recoveryDeadline,
        });
      }

      return Result.ok(statuses);
    } catch (error) {
      return Result.fail(systemErrors.internal(error));
    }
  }

  /**
   * Forcefully resets a payment gateway's circuit breaker to CLOSED.
   *
   * Validates that the gateway is one of the known gateways (VNPAY, MOMO, STRIPE),
   * then resets all state fields in the Redis Hash.
   *
   * Business rules:
   * - Only KNOWN_GATEWAYS can be reset.
   * - Resets state to CLOSED, failure_count to 0, removes opened_at.
   * - Sets last_attempt to the current timestamp.
   *
   * Side effects:
   * - Mutates the Redis Hash `circuit:payment:{gateway}`.
   *
   * @param gateway - The payment gateway identifier to reset.
   * @returns OkResult with the updated circuit breaker state, or FailResult with INTERNAL_ERROR.
   */
  async resetCircuitBreaker(
    gateway: string
  ): Promise<Result<CircuitBreakerStatusDto>> {
    if (!KNOWN_GATEWAYS.includes(gateway as (typeof KNOWN_GATEWAYS)[number])) {
      return Result.fail(
        systemErrors.internal(
          `Invalid gateway: ${gateway}. Must be one of: ${KNOWN_GATEWAYS.join(", ")}`
        )
      );
    }

    try {
      const key = `${CIRCUIT_KEY_PREFIX}:${gateway}`;

      await this.redisService.hSet(key, "state", "CLOSED");
      await this.redisService.hSet(key, "failure_count", "0");
      await this.redisService.hSet(key, "opened_at", "");
      await this.redisService.hSet(
        key,
        "last_attempt",
        new Date().toISOString()
      );

      return Result.ok({
        gateway: gateway as CircuitBreakerStatusDto["gateway"],
        state: "CLOSED",
        failure_count: 0,
        last_attempt: new Date(),
      });
    } catch (error) {
      return Result.fail(systemErrors.internal(error));
    }
  }
}
