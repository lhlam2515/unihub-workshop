/**
 * Seat Lock Mechanic
 *
 * Quản lý Redis seat:lock:{workshopId}:{registrationId}.
 * acquire(workshopId, registrationId, studentId, amount): SET NX EX 900 với JSON payload.
 * release(workshopId, registrationId): DEL key.
 * check(workshopId, registrationId): kiểm tra TTL còn không.
 *
 * Trả SEAT_LOCK_EXPIRED nếu TTL = 0 hoặc key không tồn tại.
 */

import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

@Injectable()
export class SeatLockMechanic {
  constructor(private readonly redisService: RedisService) {}

  /**
   * acquire(workshopId: string, registrationId: string, studentId: string, amount: number)
   *
   * TODO: Acquire seat lock in Redis
   * Key: seat:lock:{workshopId}:{registrationId}
   * TTL: 900 seconds (15 minutes)
   */
  async acquire(
    workshopId: string,
    registrationId: string,
    studentId: string,
    amount: number
  ) {
    // TODO: Implement
  }

  /**
   * release(workshopId: string, registrationId: string)
   *
   * TODO: Release seat lock
   */
  async release(workshopId: string, registrationId: string) {
    // TODO: Implement
  }

  /**
   * check(workshopId: string, registrationId: string)
   *
   * TODO: Check if lock still exists and TTL > 0
   */
  async check(workshopId: string, registrationId: string) {
    // TODO: Implement
  }
}
