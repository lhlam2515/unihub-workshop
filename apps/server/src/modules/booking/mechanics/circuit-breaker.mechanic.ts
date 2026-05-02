/**
 * Circuit Breaker Mechanic
 *
 * Manages a CLOSED → OPEN → HALF_OPEN state machine per payment gateway
 * stored in Redis Hash `circuit:payment:{gateway}`.
 *
 * Transitions:
 * - CLOSED: normal operation, all requests proceed.
 * - OPEN: requests rejected, cooldown timer (30s) starts.
 * - HALF_OPEN: single canary request allowed, others rejected.
 *
 * Failure window: 5 failures within rolling window triggers OPEN.
 * Cooldown: 30 seconds before transitioning from OPEN → HALF_OPEN.
 * Recovery: 1 successful canary (HALF_OPEN → CLOSED).
 *
 * State fields (Redis Hash):
 * - state: CLOSED | OPEN | HALF_OPEN
 * - failure_count: number of consecutive failures
 * - opened_at: ISO timestamp when circuit was last opened
 * - last_attempt: ISO timestamp of the last request attempt
 *
 * Side effects:
 * - Reads and writes the Redis Hash `circuit:payment:{gateway}`.
 */
import { Injectable } from "@nestjs/common";

import { RedisService } from "@/shared/redis/redis.service";
import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

const KEY_PREFIX = "circuit:payment";
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;
const FAILURE_WINDOW_MS = 60_000;

@Injectable()
export class CircuitBreakerMechanic {
  constructor(private readonly redisService: RedisService) {}

  private buildKey(gateway: string): string {
    return `${KEY_PREFIX}:${gateway}`;
  }

  /**
   * Checks whether a request to the given gateway is allowed.
   *
   * Business rules:
   * - CLOSED → allow.
   * - HALF_OPEN → reject (only one canary at a time).
   * - OPEN + cooldown expired (30s) → transition to HALF_OPEN, allow (canary).
   * - OPEN + cooldown not expired → reject.
   *
   * Side effects:
   * - Transitions OPEN → HALF_OPEN when cooldown expires.
   * - Updates last_attempt timestamp.
   *
   * @param gateway - The payment gateway identifier.
   * @returns OkResult(true) if allowed, or FailResult PAYMENT_GATEWAY_OPEN if rejected.
   */
  async checkAndAllow(gateway: string): Promise<Result<boolean>> {
    const key = this.buildKey(gateway);
    const state = await this.redisService.hGetAll(key);

    const currentState = state.state ?? "CLOSED";

    if (currentState === "CLOSED") {
      await this.redisService.hSet(
        key,
        "last_attempt",
        new Date().toISOString()
      );
      return Result.ok(true);
    }

    if (currentState === "HALF_OPEN") {
      return Result.fail(
        paymentErrors.gatewayOpen(
          gateway,
          state.opened_at ?? new Date().toISOString()
        )
      );
    }

    // OPEN state - check cooldown
    const openedAt = state.opened_at ? new Date(state.opened_at).getTime() : 0;
    const now = Date.now();

    if (now - openedAt >= COOLDOWN_MS) {
      // Cooldown expired: transition to HALF_OPEN (canary)
      await this.redisService.hSet(key, "state", "HALF_OPEN");
      await this.redisService.hSet(
        key,
        "last_attempt",
        new Date().toISOString()
      );
      return Result.ok(true);
    }

    // Still in cooldown — reject
    return Result.fail(
      paymentErrors.gatewayOpen(
        gateway,
        state.opened_at ?? new Date().toISOString()
      )
    );
  }

  /**
   * Records a successful gateway call.
   *
   * Business rules:
   * - HALF_OPEN → transition to CLOSED, reset failure_count.
   * - CLOSED → reset failure_count (keep state).
   *
   * Side effects:
   * - Updates the Redis Hash fields for the gateway.
   *
   * @param gateway - The payment gateway identifier.
   */
  async recordSuccess(gateway: string): Promise<void> {
    const key = this.buildKey(gateway);
    const currentState = await this.redisService.hGet(key, "state");

    if (currentState === "HALF_OPEN") {
      await this.redisService.hSet(key, "state", "CLOSED");
    }

    await this.redisService.hSet(key, "failure_count", "0");
  }

  /**
   * Records a failed gateway call.
   *
   * Business rules:
   * - Increments failure_count in the Redis Hash.
   * - Resets counter if 60 seconds have elapsed since the last failure
   *   (rolling window approximation).
   * - At threshold (5) → transitions to OPEN with opened_at timestamp.
   * - HALF_OPEN canary failure → transitions back to OPEN with new timestamp.
   *
   * Side effects:
   * - Updates the Redis Hash state and counter fields.
   *
   * @param gateway - The payment gateway identifier.
   */
  async recordFailure(gateway: string): Promise<void> {
    const key = this.buildKey(gateway);
    const currentState = await this.redisService.hGet(key, "state");

    if (currentState === "HALF_OPEN") {
      // Canary failed: back to OPEN with fresh timestamp
      await this.redisService.hSet(key, "state", "OPEN");
      await this.redisService.hSet(key, "opened_at", new Date().toISOString());
      return;
    }

    // Read current failure state
    const rawCount = await this.redisService.hGet(key, "failure_count");
    const lastFailure = await this.redisService.hGet(key, "last_failure_at");

    let currentCount = rawCount ? parseInt(rawCount, 10) : 0;

    // Rolling window: reset count if 60 seconds since last failure
    if (lastFailure) {
      const elapsed = Date.now() - new Date(lastFailure).getTime();
      if (elapsed > FAILURE_WINDOW_MS) {
        currentCount = 0;
      }
    }

    const newCount = currentCount + 1;

    await this.redisService.hSet(key, "failure_count", String(newCount));
    await this.redisService.hSet(
      key,
      "last_failure_at",
      new Date().toISOString()
    );

    if (newCount >= FAILURE_THRESHOLD) {
      await this.redisService.hSet(key, "state", "OPEN");
      await this.redisService.hSet(key, "opened_at", new Date().toISOString());
    }
  }
}
