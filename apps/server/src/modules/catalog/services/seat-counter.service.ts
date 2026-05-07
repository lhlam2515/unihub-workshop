/**
 * Seat Counter Service
 *
 * Manages Redis-based seat counters for real-time availability tracking.
 *
 * Key pattern: seat:available:{workshopId}
 *
 * Design rationale:
 * - Redis is the source of truth for seat availability to handle concurrent
 *   registration requests with atomic DECR operations.
 * - The counter is initialized when a workshop is published and deleted when
 *   it is cancelled.
 * - Other modules (e.g., Booking) use this service to decrement the counter
 *   during registration and increment during cancellation.
 *
 * @note This service is exported from CatalogModule for use by BookingModule
 *       (cross-module Service-to-Service communication only).
 */

import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { seatErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { WorkshopSlotsRepository } from "../repositories/workshop-slots.repository";

@Injectable()
export class SeatCounterService {
  private readonly keyPrefix = "seat:available";

  constructor(
    private readonly redisService: RedisService,
    private readonly workshopSlotsRepo: WorkshopSlotsRepository
  ) {}

  /**
   * Initializes the available seat counter in Redis for a workshop.
   *
   * Business rules:
   * - Sets the counter to the workshop's total capacity.
   * - The key is persistent (no TTL) — it lives until the workshop is cancelled.
   *
   * Side effects:
   * - Creates or overwrites the `seat:available:{workshopId}` key in Redis.
   *
   * @param workshopId - The UUID of the workshop.
   * @param capacity - Total seat capacity of the workshop.
   */
  async initialize(workshopId: string, capacity: number): Promise<void> {
    await this.redisService.set(
      `${this.keyPrefix}:${workshopId}`,
      String(capacity)
    );
  }

  /**
   * Retrieves the current number of available seats for a workshop.
   *
   * Business rules:
   * - Reads from Redis first for real-time accuracy (source of truth during booking).
   * - Falls back to PostgreSQL workshop_slots (total_capacity - confirmed_count)
   *   if the Redis key is missing (e.g., after Redis restart or delayed init).
   * - Returns 0 if neither Redis nor DB has counter data.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns Available seat count from Redis (preferred) or DB (fallback), or 0 if no data exists.
   */
  async getAvailable(workshopId: string): Promise<number> {
    // Redis-first: source of truth during concurrent booking
    const value = await this.redisService.get(
      `${this.keyPrefix}:${workshopId}`
    );
    if (value !== null) return parseInt(value, 10);

    // DB fallback: totalCapacity - confirmedCount
    const slotResult =
      await this.workshopSlotsRepo.findByWorkshopId(workshopId);
    if (slotResult.isSuccess && slotResult.data) {
      return slotResult.data.totalCapacity - slotResult.data.confirmedCount;
    }

    // No data available in either Redis or DB
    return 0;
  }

  /**
   * Deletes the available seat counter from Redis.
   *
   * Business rules:
   * - Idempotent: does not fail if the key does not exist.
   *
   * Side effects:
   * - Removes the `seat:available:{workshopId}` key from Redis.
   *
   * @param workshopId - The UUID of the workshop.
   */
  async delete(workshopId: string): Promise<void> {
    await this.redisService.del(`${this.keyPrefix}:${workshopId}`);
  }

  /**
   * Atomically decrements the available seat counter.
   *
   * Business rules:
   * - Used by Booking module to reserve a seat during registration.
   * - If the counter goes below 0, the decrement is rolled back via INCR
   *   and the method returns FailResult (seat unavailable).
   *
   * Side effects:
   * - Atomically decrements `seat:available:{workshopId}` in Redis.
   * - May increment the key back (rollback) if the new value is negative.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with void if seat was reserved, or FailResult (SEAT_UNAVAILABLE) if sold out.
   */
  async decrement(workshopId: string): Promise<Result<void>> {
    const key = `${this.keyPrefix}:${workshopId}`;
    const result = await this.redisService.decr(key);
    if (result < 0) {
      // Rollback: seat was already sold out
      await this.redisService.incr(key);
      return Result.fail(seatErrors.unavailable(workshopId));
    }
    return Result.ok();
  }

  /**
   * Atomically increments the available seat counter.
   *
   * Business rules:
   * - Used when a registration is cancelled or expires, releasing a seat.
   * - Always succeeds since incrementing a counter cannot overflow for practical capacities.
   *
   * Side effects:
   * - Atomically increments `seat:available:{workshopId}` in Redis.
   *
   * @param workshopId - The UUID of the workshop whose seat count to increment.
   * @returns The new seat count after increment.
   */
  async increment(workshopId: string): Promise<number> {
    return this.redisService.incr(`${this.keyPrefix}:${workshopId}`);
  }
}
