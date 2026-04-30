import { Injectable } from "@nestjs/common";

import { RedisService } from "@/shared/redis/redis.service";
import { rateLimitError } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

const KEY = "ratelimit:global:register";
const THRESHOLD = 500;

@Injectable()
export class GlobalRateLimitMechanic {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Enforces a system-wide request rate cap on the registration endpoint.
   *
   * Uses a 1-second fixed window with a 500 request/second threshold.
   *
   * Business rules:
   * - First request in each window sets the key expiry (EXPIRE 1).
   * - Requests exceeding the threshold are rejected with RATE_LIMIT_EXCEEDED.
   *
   * Side effects:
   * - Increments the Redis counter at ratelimit:global:register.
   * - Sets 1s expiry on the first request of each window.
   *
   * @returns OkResult(true) if under threshold, or FailResult with code:
   * - RATE_LIMIT_EXCEEDED: Global threshold of 500 req/s exceeded.
   */
  async check(): Promise<Result<boolean>> {
    const counter = await this.redisService.incr(KEY);

    if (counter === 1) {
      await this.redisService.expire(KEY, 1);
    }

    if (counter > THRESHOLD) {
      return Result.fail(rateLimitError(THRESHOLD, 1));
    }

    return Result.ok(true);
  }
}
