import { Injectable, Logger } from "@nestjs/common";

import { paymentErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_RATE_THRESHOLD = 0.5;
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

export interface CircuitState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  /** Consecutive failures since last success (resets on success). */
  failureCount: number;
  /** All failures in the current 60s window (never resets on success — only at window boundary). */
  windowFailureCount: number;
  totalCount: number;
  windowStart: number;
  openedAt: number;
  lastAttempt: number;
  lastFailureAt: number;
  halfOpenSuccessCount: number;
}

function createInitialState(): CircuitState {
  return {
    state: "CLOSED",
    failureCount: 0,
    windowFailureCount: 0,
    totalCount: 0,
    windowStart: Date.now(),
    openedAt: 0,
    lastAttempt: 0,
    lastFailureAt: 0,
    halfOpenSuccessCount: 0,
  };
}

@Injectable()
export class CircuitBreakerMechanic {
  private readonly logger = new Logger(CircuitBreakerMechanic.name);

  /** In-process memory per ADR-07. Single process = no distributed coordination needed. */
  private readonly circuits = new Map<string, CircuitState>();

  private getState(gateway: string): CircuitState {
    if (!this.circuits.has(gateway)) {
      this.circuits.set(gateway, createInitialState());
    }
    return this.circuits.get(gateway)!;
  }

  /**
   * Checks whether a request to the given gateway is allowed.
   *
   * Business rules (ADR-07):
   * - CLOSED → allow.
   * - HALF_OPEN → reject (only one canary at a time).
   * - OPEN + cooldown expired (30s) → transition to HALF_OPEN, allow (canary).
   * - OPEN + cooldown not expired → reject with PAYMENT_GATEWAY_OPEN.
   *
   * Side effects:
   * - Transitions OPEN → HALF_OPEN when cooldown expires.
   * - Resets halfOpenSuccessCount on HALF_OPEN transition.
   * - Updates lastAttempt timestamp.
   *
   * @param gateway - The payment gateway identifier.
   * @returns OkResult(true) if allowed, or FailResult with PAYMENT_GATEWAY_OPEN.
   */
  async checkAndAllow(gateway: string): Promise<Result<boolean>> {
    const state = this.getState(gateway);

    if (state.state === "CLOSED") {
      state.lastAttempt = Date.now();
      return Result.ok(true);
    }

    if (state.state === "HALF_OPEN") {
      return Result.fail(
        paymentErrors.gatewayOpen(
          gateway,
          new Date(state.openedAt).toISOString()
        )
      );
    }

    // OPEN state — check cooldown
    const now = Date.now();
    if (now - state.openedAt >= COOLDOWN_MS) {
      // Cooldown expired: transition to HALF_OPEN (canary)
      state.state = "HALF_OPEN";
      state.halfOpenSuccessCount = 0;
      state.lastAttempt = now;
      this.logger.log(
        `Circuit breaker HALF_OPEN — sending canary for ${gateway}`
      );
      return Result.ok(true);
    }

    // Still in cooldown — reject
    return Result.fail(
      paymentErrors.gatewayOpen(gateway, new Date(state.openedAt).toISOString())
    );
  }

  /**
   * Records a successful gateway call.
   *
   * Business rules:
   * - HALF_OPEN → increment halfOpenSuccessCount; close circuit when >= 2.
   * - CLOSED → reset failureCount.
   * - Always increments totalCount for rate calculation.
   *
   * @param gateway - The payment gateway identifier.
   */
  async recordSuccess(gateway: string): Promise<void> {
    const state = this.getState(gateway);
    state.totalCount += 1;

    if (state.state === "HALF_OPEN") {
      state.halfOpenSuccessCount += 1;
      if (state.halfOpenSuccessCount >= HALF_OPEN_SUCCESS_THRESHOLD) {
        state.state = "CLOSED";
        state.failureCount = 0;
        state.halfOpenSuccessCount = 0;
        this.logger.log(`Circuit breaker CLOSED (recovered) for ${gateway}`);
      }
      return;
    }

    // CLOSED — reset consecutive failure counter only.
    // windowFailureCount is intentionally NOT reset so cumulative failures
    // in the 60s window continue to accumulate toward the rate threshold (E-02).
    state.failureCount = 0;
  }

  /**
   * Records a failed gateway call.
   *
   * Business rules:
   * - Resets counters if 60s have elapsed since windowStart.
   * - Increments failureCount AND totalCount.
   * - Opens circuit when failureCount >= 5 OR failureRate >= 50% (min 3 requests).
   * - HALF_OPEN canary failure → reset halfOpenSuccessCount, back to OPEN.
   *
   * @param gateway - The payment gateway identifier.
   */
  async recordFailure(gateway: string): Promise<void> {
    const state = this.getState(gateway);

    if (state.state === "HALF_OPEN") {
      state.state = "OPEN";
      state.openedAt = Date.now();
      state.halfOpenSuccessCount = 0;
      this.logger.warn(
        `Circuit breaker probe FAILED — back to OPEN for ${gateway}`
      );
      return;
    }

    const now = Date.now();

    // Rolling window: reset all window counters if 60s since windowStart
    if (now - state.windowStart > FAILURE_WINDOW_MS) {
      state.failureCount = 0;
      state.windowFailureCount = 0;
      state.totalCount = 0;
      state.windowStart = now;
    }

    state.failureCount += 1;
    state.windowFailureCount += 1;
    state.totalCount += 1;
    state.lastFailureAt = now;

    // Check both conditions: consecutive failures OR rate >= 50% in 60s window.
    // windowFailureCount is used for rate (not failureCount which resets on success)
    // so interleaved F-S-F-S patterns correctly accumulate toward the threshold (E-02).
    const rateExceeded =
      state.totalCount >= 3 &&
      state.windowFailureCount / state.totalCount >= FAILURE_RATE_THRESHOLD;

    if (state.failureCount >= FAILURE_THRESHOLD || rateExceeded) {
      state.state = "OPEN";
      state.openedAt = now;
      this.logger.warn(`Circuit breaker OPENED for ${gateway}`, {
        reason:
          state.failureCount >= FAILURE_THRESHOLD
            ? "consecutive_failures"
            : "rate_exceeded",
        failureCount: state.failureCount,
        totalCount: state.totalCount,
      });
    }
  }

  /**
   * Returns the current state for a gateway (admin monitoring).
   *
   * @param gateway - The payment gateway identifier.
   */
  getGatewayState(gateway: string): CircuitState {
    return { ...this.getState(gateway) };
  }

  /**
   * Returns all known gateway states (admin monitoring).
   */
  getAllStates(): Map<string, CircuitState> {
    return this.circuits;
  }

  /**
   * Force-resets a gateway's circuit breaker to CLOSED (admin action).
   *
   * @param gateway - The payment gateway identifier.
   */
  reset(gateway: string): void {
    this.circuits.set(gateway, createInitialState());
  }
}
