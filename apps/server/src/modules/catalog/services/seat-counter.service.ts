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

import { RedisService } from "@/shared/redis/redis.service";

@Injectable()
export class SeatCounterService {
  private readonly keyPrefix = "seat:available";

  constructor(private readonly redisService: RedisService) {}

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
   * - Reads directly from Redis for real-time accuracy.
   * - Returns 0 if the key does not exist in Redis (fallback for uninitialized counters).
   *
   * @param workshopId - The UUID of the workshop.
   * @returns Available seat count, or 0 if the counter is not in Redis.
   */
  async getAvailable(workshopId: string): Promise<number> {
    const value = await this.redisService.get(
      `${this.keyPrefix}:${workshopId}`
    );
    if (value === null) return 0;
    return parseInt(value, 10);
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
}
