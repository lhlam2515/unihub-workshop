import { Injectable } from "@nestjs/common";

import { RedisService } from "@/shared/redis/redis.service";
import { seatErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

const KEY_PREFIX = "seat:lock";
const LOCK_TTL_SECONDS = 900;

/** Shared between SeatLockMechanic and PaymentsService — must stay in sync. */
export const PAYMENT_WINDOW_SECONDS = LOCK_TTL_SECONDS;

interface SeatLockPayload {
  studentId: string;
}

export interface SeatLockCheckResult {
  valid: boolean;
  remainingSeconds: number;
}

@Injectable()
export class SeatLockMechanic {
  constructor(private readonly redisService: RedisService) {}

  private buildKey(workshopId: string, registrationId: string): string {
    return `${KEY_PREFIX}:${workshopId}:${registrationId}`;
  }

  /**
   * Acquires a distributed seat lock for a paid workshop registration.
   *
   * Uses Redis SET NX with a 900-second TTL to prevent concurrent seat
   * claims during the payment window.
   *
   * Side effects:
   * - Creates Redis key seat:lock:{workshopId}:{registrationId} with JSON payload
   *   containing studentId, amount, and createdAt.
   *
   * @param workshopId - The UUID of the workshop being registered for.
   * @param registrationId - The UUID of the newly created registration.
   * @param studentId - The UUID of the student claiming the seat.
   * @param amount - The payment amount required (VND), stored for payment verification.
   * @returns OkResult(true) if lock acquired, or FailResult with code:
   * - SEAT_LOCK_EXPIRED: Lock key already exists — duplicate seat claim.
   */
  async acquire(
    workshopId: string,
    registrationId: string,
    studentId: string,
    _amount: number
  ): Promise<Result<boolean>> {
    const key = this.buildKey(workshopId, registrationId);
    const payload: SeatLockPayload = {
      studentId,
    };

    const created = await this.redisService.setNx(
      key,
      JSON.stringify(payload),
      LOCK_TTL_SECONDS
    );

    if (!created) {
      return Result.fail(seatErrors.lockExpired(workshopId, registrationId));
    }

    return Result.ok(true);
  }

  /**
   * Releases a seat lock, making the seat available for other students.
   *
   * Idempotent — safe to call even if the lock has already expired or was
   * previously released.
   *
   * Side effects:
   * - Deletes the Redis key seat:lock:{workshopId}:{registrationId}.
   *
   * @param workshopId - The UUID of the workshop.
   * @param registrationId - The UUID of the registration whose lock is being released.
   * @returns OkResult(true) — always succeeds (idempotent no-op if key missing).
   */
  async release(
    workshopId: string,
    registrationId: string
  ): Promise<Result<boolean>> {
    const key = this.buildKey(workshopId, registrationId);
    await this.redisService.del(key);
    return Result.ok(true);
  }

  /**
   * Checks the validity and remaining lifetime of a seat lock.
   *
   * Side effects:
   * - Reads the TTL of Redis key seat:lock:{workshopId}:{registrationId}.
   *
   * @param workshopId - The UUID of the workshop.
   * @param registrationId - The UUID of the registration.
   * @returns OkResult with { valid: true, remainingSeconds }, or FailResult with code:
   * - SEAT_LOCK_EXPIRED: Lock key does not exist or TTL has reached 0.
   */
  async check(
    workshopId: string,
    registrationId: string
  ): Promise<Result<SeatLockCheckResult>> {
    const key = this.buildKey(workshopId, registrationId);
    const ttl = await this.redisService.ttl(key);

    if (ttl <= 0) {
      return Result.fail(seatErrors.lockExpired(workshopId, registrationId));
    }

    return Result.ok({ valid: true, remainingSeconds: ttl });
  }
}
