/**
 * Seat Counter Service
 *
 * Quản lý Redis counter cho available seats:
 * - initialize(workshopId, capacity) — dùng khi publish
 * - getAvailable(workshopId) — đọc từ Redis, fallback PostgreSQL
 * - delete(workshopId) — dùng khi cancel
 *
 * Tách riêng để BookingModule import dùng cho DECR
 */

import { Injectable } from "@nestjs/common";

import { RedisService } from "@/shared/redis/redis.service";

@Injectable()
export class SeatCounterService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * initialize(workshopId: string, capacity: number)
   *
   * TODO: Set Redis counter
   * - Key: seat:available:{workshopId}
   * - Value: capacity
   */
  async initialize(workshopId: string, capacity: number) {
    // TODO: Implement
  }

  /**
   * getAvailable(workshopId: string)
   *
   * TODO: Get available seats count
   * 1. Try Redis
   * 2. Fallback to PostgreSQL if not found
   */
  async getAvailable(workshopId: string): Promise<number> {
    // TODO: Implement
    return 0;
  }

  /**
   * delete(workshopId: string)
   *
   * TODO: Delete Redis counter
   */
  async delete(workshopId: string) {
    // TODO: Implement
  }
}
