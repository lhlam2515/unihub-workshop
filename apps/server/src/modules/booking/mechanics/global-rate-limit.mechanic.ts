/**
 * Global Rate Limit Mechanic
 *
 * Rate limit toàn hệ thống (không phải per-user).
 * check(): INCR ratelimit:global:register + EXPIRE 1s.
 * Nếu counter > 500 → trả 429.
 * Sliding window đơn giản.
 *
 * Chạy trước Token Bucket per-user trong luồng đăng ký.
 */

import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

@Injectable()
export class GlobalRateLimitMechanic {
  constructor(private readonly redisService: RedisService) {}

  /**
   * check(): Promise<Result<boolean>>
   *
   * TODO: Check global rate limit
   * 1. INCR ratelimit:global:register
   * 2. EXPIRE 1 second
   * 3. If counter > 500, return error
   */
  async check() {
    // TODO: Implement
  }
}
