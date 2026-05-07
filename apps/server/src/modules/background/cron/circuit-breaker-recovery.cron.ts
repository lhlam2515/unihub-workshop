/**
 * CircuitBreakerRecoveryCron
 *
 * Scheduled job that checks all payment gateway circuit breakers stored in Redis
 * and transitions any that are OPEN past their cooldown period to HALF_OPEN.
 *
 * Runs every 30 seconds.
 *
 * Business rules:
 * - Only transitions OPEN → HALF_OPEN when (now - opened_at) >= 30 seconds.
 * - NEVER transitions directly to CLOSED — the canary request in the
 *   payment flow determines HALF_OPEN → CLOSED.
 * - Logs each transition for audit and observability.
 *
 * Side effects:
 * - Mutates Redis Hash `circuit:payment:{gateway}` state fields.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { RedisService } from "@/infra/redis/redis.service";

/** Known payment gateways managed by the circuit breaker system. */
const KNOWN_GATEWAYS = ["VNPAY", "MOMO", "STRIPE"] as const;

/** Redis key prefix for circuit breaker state hashes. */
const CIRCUIT_KEY_PREFIX = "circuit:payment";

/** Cooldown period in milliseconds before an OPEN circuit can transition to HALF_OPEN. */
const COOLDOWN_MS = 30_000;

@Injectable()
export class CircuitBreakerRecoveryCron {
  private readonly logger = new Logger(CircuitBreakerRecoveryCron.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Checks all known gateways and recovers any circuit breaker past its cooldown.
   *
   * Runs every 30 seconds. Wraps each gateway check in a try/catch so a single
   * gateway failure does not prevent recovery of others.
   *
   * Side effects:
   * - Sets `circuit:payment:{gateway}` state to HALF_OPEN when cooldown expires.
   *
   * @returns void — errors are logged but never propagated.
   */
  @Cron("*/30 * * * * *")
  async handleCircuitBreakerRecovery(): Promise<void> {
    for (const gateway of KNOWN_GATEWAYS) {
      try {
        const key = `${CIRCUIT_KEY_PREFIX}:${gateway}`;
        const state = await this.redisService.hGetAll(key);

        if (state.state === "OPEN") {
          const openedAt = state.opened_at
            ? new Date(state.opened_at).getTime()
            : 0;
          const now = Date.now();

          if (now - openedAt >= COOLDOWN_MS) {
            await this.redisService.hSet(key, "state", "HALF_OPEN");
            this.logger.log(
              `Circuit breaker ${gateway}: OPEN → HALF_OPEN (cooldown expired)`
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Circuit breaker recovery check failed for ${gateway}: ${error}`
        );
      }
    }
  }
}
