import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";

const CACHE_KEY_PREFIX = "cache:workshop";
const SEAT_CACHE_TTL_SECONDS = 10;

@Injectable()
export class SeatCounterService {
  constructor(
    private readonly redisService: RedisService,
    private readonly workshopsRepo: WorkshopsRepository
  ) {}

  /**
   * Cache-Aside read for seat availability.
   *
   * GET cache → hit: return cached value.
   * Miss → SELECT seats_available FROM workshops (PostgreSQL source of truth)
   * → SET cache EX 10 → return value.
   *
   * Used as a pre-filter before Optimistic Locking — NEVER as the final
   * authority on seat availability. That is always WHERE seats_available > 0
   * in PostgreSQL (ADR-03 enforcement layer).
   *
   * @param workshopId - The UUID of the workshop.
   * @returns Cached seat count, or 0 if workshop not found.
   */
  async getCachedSeats(workshopId: string): Promise<number> {
    const key = `${CACHE_KEY_PREFIX}:${workshopId}:seats`;
    const cached = await this.redisService.get(key);
    if (cached !== null) {
      return parseInt(cached, 10);
    }

    // Cache miss — read from PostgreSQL (source of truth)
    const dbResult = await this.workshopsRepo.getSeatVersion(workshopId);
    if (dbResult.isFailure || !dbResult.data) return 0;

    const seats = dbResult.data.seatsAvailable;
    await this.redisService.set(key, String(seats), SEAT_CACHE_TTL_SECONDS);
    return seats;
  }

  /**
   * Write-Invalidate: deletes the seat cache key after a successful OL commit.
   *
   * Side effects:
   * - DEL cache:workshop:{workshopId}:seats
   *
   * @param workshopId - The UUID of the workshop.
   */
  async invalidateCache(workshopId: string): Promise<void> {
    await this.redisService.del(`${CACHE_KEY_PREFIX}:${workshopId}:seats`);
  }

  /**
   * Initializes the seat cache for a newly published workshop.
   *
   * Side effects:
   * - SET cache:workshop:{workshopId}:seats = seatsTotal EX 10
   *
   * @param workshopId - The UUID of the workshop.
   * @param seatsTotal - Total seat count from the workshop record.
   */
  async initialize(workshopId: string, seatsTotal: number): Promise<void> {
    await this.redisService.set(
      `${CACHE_KEY_PREFIX}:${workshopId}:seats`,
      String(seatsTotal),
      SEAT_CACHE_TTL_SECONDS
    );
  }

  /**
   * Deletes the seat cache key for a workshop (cleanup).
   *
   * @param workshopId - The UUID of the workshop.
   */
  async delete(workshopId: string): Promise<void> {
    await this.redisService.del(`${CACHE_KEY_PREFIX}:${workshopId}:seats`);
  }
}
