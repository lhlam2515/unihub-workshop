/**
 * Idempotency Mechanic
 *
 * Layer 1 of double-charge prevention using Redis SET NX.
 * The DB UNIQUE constraint on payments.idempotency_key serves as Layer 2.
 *
 * Key pattern: idempotency:{idempotencyKey} with 24-hour TTL.
 * Value transitions: "pending" (placeholder) → actual payment_id after creation.
 *
 * Business rules:
 * - SET NX succeeds → key is new, payment flow proceeds.
 * - SET NX fails → key exists, return existing payment_id (duplicate).
 * - Redis failure → DB UNIQUE constraint (Layer 2) is the ultimate guard.
 *
 * Side effects:
 * - Creates a Redis key with TTL 86400 on first check.
 * - Updates the key value after payment creation.
 */
import { Injectable } from "@nestjs/common";

import { RedisService } from "@/shared/redis/redis.service";
import { Result } from "@/shared/response/result";

const IDEMPOTENCY_TTL_SECONDS = 86_400;
const KEY_PREFIX = "idempotency";

export interface IdempotencyCheckResult {
  proceed: boolean;
  existingPaymentId?: string;
}

@Injectable()
export class IdempotencyMechanic {
  constructor(private readonly redisService: RedisService) {}

  private buildKey(idempotencyKey: string): string {
    return `${KEY_PREFIX}:${idempotencyKey}`;
  }

  /**
   * Checks the idempotency key via Redis SET NX.
   *
   * If the key already exists, retrieves the stored payment_id to return
   * to the caller for duplicate detection.
   *
   * Business rules:
   * - New key: returns { proceed: true } with placeholder set.
   * - Existing key: returns { proceed: false, existingPaymentId }.
   *
   * Side effects:
   * - Creates a Redis key `idempotency:{key}` with TTL 86400 when new.
   *
   * @param idempotencyKey - The idempotency key from the X-Idempotency-Key header.
   * @returns OkResult with proceed flag and optional existing payment ID,
   * or FailResult with INTERNAL_ERROR on Redis failure.
   */
  async check(idempotencyKey: string): Promise<Result<IdempotencyCheckResult>> {
    try {
      const key = this.buildKey(idempotencyKey);
      const created = await this.redisService.setNx(
        key,
        "pending",
        IDEMPOTENCY_TTL_SECONDS
      );

      if (created) {
        return Result.ok({ proceed: true });
      }

      const existingPaymentId = await this.redisService.get(key);
      return Result.ok({
        proceed: false,
        existingPaymentId: existingPaymentId ?? undefined,
      });
    } catch {
      // Redis failure: allow proceed since DB UNIQUE is Layer 2
      return Result.ok({ proceed: true });
    }
  }

  /**
   * Updates the idempotency key value from placeholder to the actual payment_id.
   *
   * Call this after the payment record is successfully created so that
   * subsequent duplicate requests return the real payment_id.
   *
   * Side effects:
   * - Overwrites the Redis key value with the payment_id (TTL is refreshed).
   *
   * @param idempotencyKey - The idempotency key to update.
   * @param paymentId - The actual payment UUID to store.
   */
  async setPaymentId(idempotencyKey: string, paymentId: string): Promise<void> {
    const key = this.buildKey(idempotencyKey);
    await this.redisService.set(key, paymentId, IDEMPOTENCY_TTL_SECONDS);
  }
}
