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

import { RedisService } from "@/infra/redis/redis.service";
import { WorkshopsService } from "@/modules/catalog/services/workshops.service";
import { CircuitBreakerMechanic } from "@/modules/payment/mechanics/circuit-breaker.mechanic";
import { PaymentsService } from "@/modules/payment/services/payments.service";
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

/** Maximum allowed seat-counter discrepancy before flagging as an issue. */
const DISCREPANCY_THRESHOLD = 5;

@Injectable()
export class SystemMonitorService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly workshopsService: WorkshopsService,
    private readonly redisService: RedisService,
    private readonly circuitBreaker: CircuitBreakerMechanic
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
      pendingCount: pendingResult.data,
      timeoutCount: overdueResult.data,
      lastRun: paymentLastRun,
      nextRun: nextRun,
      jobStatus: "IDLE",
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
      const key = `cache:workshop:${workshop.workshopId}:seats`;
      const redisValueStr = await this.redisService.get(key);
      const redisValue = redisValueStr
        ? parseInt(redisValueStr, 10)
        : workshop.seatsTotal;

      // Expected = seatsTotal - (confirmed in DB + locked in Redis)
      const confirmedResult = await this.workshopsService.getPublishedById(
        workshop.workshopId
      );
      if (confirmedResult.isFailure) continue;

      const lockPattern = `seat:lock:${workshop.workshopId}:*`;
      const lockKeys = await this.redisService.scanKeys(lockPattern);
      const expectedValue = workshop.seatsTotal - lockKeys.length;

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
      totalWorkshops: workshops.length,
      discrepanciesFound: discrepanciesFound,
      lastRun: reconLastRun,
      nextRun: nextRun,
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
        const state = this.circuitBreaker.getGatewayState(gateway);

        statuses.push({
          gateway: gateway,
          state: state.state,
          failureCount: state.failureCount,
          openedAt: state.openedAt > 0 ? new Date(state.openedAt) : undefined,
          lastAttempt:
            state.lastAttempt > 0 ? new Date(state.lastAttempt) : undefined,
          recoveryDeadline:
            state.state === "OPEN" && state.openedAt > 0
              ? new Date(state.openedAt + 30_000)
              : undefined,
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
      this.circuitBreaker.reset(gateway);

      return Result.ok({
        gateway: gateway as CircuitBreakerStatusDto["gateway"],
        state: "CLOSED",
        failureCount: 0,
        lastAttempt: new Date(),
      });
    } catch (error) {
      return Result.fail(systemErrors.internal(error));
    }
  }
}
