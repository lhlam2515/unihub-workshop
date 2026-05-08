import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";

const CACHE_KEY_PREFIX = "cache:workshop";
const SEAT_CACHE_TTL_SECONDS = 10;

@Injectable()
export class SeatCounterService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Cache-Aside read for seat availability.
   *
   * GET cache → hit: return cached value; miss: return 0.
   * Full read-through from PostgreSQL is wired in the Optimistic Locking commit
   * when WorkshopsRepository.getSeatVersion becomes available.
   *
   * Used as a pre-filter before Optimistic Locking — NEVER as the final
   * authority on seat availability.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns Cached seat count, or 0 on cache miss.
   */
  async getCachedSeats(workshopId: string): Promise<number> {
    const key = `${CACHE_KEY_PREFIX}:${workshopId}:seats`;
    const cached = await this.redisService.get(key);
    return cached !== null ? parseInt(cached, 10) : 0;
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
