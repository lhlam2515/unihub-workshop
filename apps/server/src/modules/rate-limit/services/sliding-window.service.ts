import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { rateLimitError } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import type { RateLimitTierName } from "../constants/rate-limit.constants";
import { RATE_LIMIT_TIERS } from "../constants/rate-limit.constants";

/**
 * Sliding Window Counter using Redis Sorted Sets.
 *
 * Each request is stored as a member with a timestamp score inside a Redis
 * Sorted Set scoped by `rl:tier:{tier}:{identifier}`. The 4-command MULTI/EXEC
 * pipeline (ZREMRANGEBYSCORE → ZADD → ZCARD → EXPIRE) runs atomically so no
 * concurrent request can bypass the limit.
 *
 * Fail-open behaviour: if Redis is unreachable the method returns
 * `{ allowed: true }` so that a Redis outage does not block traffic.
 */
@Injectable()
export class SlidingWindowService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Checks whether a request is within the configured rate limit for a given
   * tier and identifier.
   *
   * @param tier - The rate-limit tier name (T1 / T2 / T3).
   * @param identifier - The subject identifier (IP address or user UUID).
   * @returns OkResult with `{ allowed, remaining, resetMs }`, or FailResult
   *          with RATE_LIMIT_EXCEEDED.
   */
  async check(
    tier: RateLimitTierName,
    identifier: string
  ): Promise<Result<{ allowed: boolean; remaining: number; resetMs: number }>> {
    const config = RATE_LIMIT_TIERS[tier];
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `rl:tier:${tier}:${identifier}`;
    const windowSec = Math.ceil(config.windowMs / 1000);

    try {
      const pipeline = this.redisService.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, `${now}-${randomUUID()}`);
      pipeline.zcard(key);
      pipeline.expire(key, windowSec);
      const results = (await pipeline.exec()) as [unknown, unknown][] | null;

      const count: number = (results?.[2]?.[1] as number) ?? 0;

      if (count > config.limit) {
        const oldest = await this.redisService.zrange(key, 0, 0);
        const resetMs =
          oldest.length > 0
            ? Number(oldest[0]) + config.windowMs - now
            : config.windowMs;
        const retryAfter = Math.ceil(resetMs / 1000);
        return Result.fail(rateLimitError(config.limit, retryAfter, tier));
      }

      const remaining = Math.max(0, config.limit - count);
      const oldest = await this.redisService.zrange(key, 0, 0);
      const resetMs =
        oldest.length > 0
          ? Number(oldest[0]) + config.windowMs - now
          : config.windowMs;

      return Result.ok({ allowed: true, remaining, resetMs });
    } catch {
      // Fail-open: Redis error → allow the request through
      return Result.ok({
        allowed: true,
        remaining: config.limit,
        resetMs: 0,
      });
    }
  }
}
