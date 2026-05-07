import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { rateLimitError } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

const KEY_PREFIX = "ratelimit:register";
const CAPACITY = 5;
const REFILL_INTERVAL_MS = 5_000;
const KEY_TTL_SECONDS = 300;

interface TokenBucket {
  tokens: string;
  last_refill_at: string;
}

@Injectable()
export class RateLimiterMechanic {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Consumes a token from the per-user rate limiter bucket.
   *
   * Implements the Token Bucket algorithm with lazy refill. Each user gets a
   * capacity of 5 tokens, refilling at 1 token per 5 seconds. The bucket
   * auto-expires after 300 seconds of inactivity.
   *
   * Business rules:
   * - First request initializes a new bucket with 4 tokens (5 minus 1 consumed).
   * - Subsequent requests refill based on elapsed time since last refill.
   * - Empty bucket returns RATE_LIMIT_EXCEEDED with retry_after guidance.
   *
   * Side effects:
   * - Creates or updates the Redis Hash at ratelimit:register:{userId}.
   * - Sets 300s TTL on first initialization.
   *
   * @param userId - The student's UUID, used as the rate limit subject.
   * @returns OkResult(true) if token consumed, or FailResult with code:
   * - RATE_LIMIT_EXCEEDED: Bucket empty, retry_after included in error context.
   */
  async consumeToken(userId: string): Promise<Result<boolean>> {
    const key = `${KEY_PREFIX}:${userId}`;
    const bucket = await this.redisService.hGetAll(key);
    const now = Date.now();

    if (Object.keys(bucket).length === 0) {
      // First request: init with 4 tokens (5 - 1 consumed right away)
      await Promise.all([
        this.redisService.hSet(key, "tokens", String(CAPACITY - 1)),
        this.redisService.hSet(key, "last_refill_at", String(now)),
        this.redisService.expire(key, KEY_TTL_SECONDS),
      ]);
      return Result.ok(true);
    }

    const parsed = bucket as unknown as TokenBucket;
    const currentTokens = Number(parsed.tokens);
    const lastRefillAt = Number(parsed.last_refill_at);
    const elapsedMs = now - lastRefillAt;

    // Lazy refill: calculate how many tokens accumulated since last check
    const refillTokens = Math.floor(elapsedMs / REFILL_INTERVAL_MS);
    const tokens = Math.min(CAPACITY, currentTokens + refillTokens) - 1;

    if (tokens < 0) {
      // Bucket empty — calculate retry-after
      const msUntilNextRefill =
        REFILL_INTERVAL_MS - (elapsedMs % REFILL_INTERVAL_MS);
      const retryAfter = Math.ceil(msUntilNextRefill / 1000);
      return Result.fail(rateLimitError(CAPACITY, Math.max(1, retryAfter)));
    }

    // Update bucket: new token count stays, refill timestamp advances only if refill happened
    await Promise.all([
      this.redisService.hSet(key, "tokens", String(tokens)),
      this.redisService.hSet(
        key,
        "last_refill_at",
        String(
          refillTokens > 0
            ? lastRefillAt + refillTokens * REFILL_INTERVAL_MS
            : lastRefillAt
        )
      ),
    ]);

    return Result.ok(true);
  }
}
