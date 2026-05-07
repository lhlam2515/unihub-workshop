import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";

import { RateLimiterMechanic } from "./rate-limiter.service";

describe("RateLimiterMechanic", () => {
  let mechanic: RateLimiterMechanic;
  let redisService: jest.Mocked<RedisService>;

  const USER_ID = "user-001";
  const key = `ratelimit:register:${USER_ID}`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterMechanic,
        {
          provide: RedisService,
          useValue: {
            hGetAll: jest.fn(),
            hSet: jest.fn(),
            expire: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<RateLimiterMechanic>(RateLimiterMechanic);
    redisService = module.get(RedisService);
  });

  describe("consumeToken — FR-F04-001 (Token Bucket: 5 tokens, 1/10s refill, BR-016)", () => {
    it("should initialize bucket with 4 tokens on first request", async () => {
      redisService.hGetAll.mockResolvedValue({});
      redisService.hSet.mockResolvedValue(1);
      redisService.expire.mockResolvedValue(true);

      const result = await mechanic.consumeToken(USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.hSet).toHaveBeenCalledWith(key, "tokens", "4");
      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "last_refill_at",
        expect.any(String)
      );
      expect(redisService.expire).toHaveBeenCalledWith(key, 300);
    });

    it("should decrement token when bucket has remaining tokens", async () => {
      const now = Date.now();
      redisService.hGetAll.mockResolvedValue({
        tokens: "3",
        last_refill_at: String(now),
      });
      redisService.hSet.mockResolvedValue(1);

      const result = await mechanic.consumeToken(USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.hSet).toHaveBeenCalledWith(key, "tokens", "2");
    });

    it("should return RATE_LIMIT_EXCEEDED when bucket is empty with retry_after", async () => {
      const now = Date.now();
      // Fill bucket with 0 tokens, last refill just happened
      redisService.hGetAll.mockResolvedValue({
        tokens: "0",
        last_refill_at: String(now),
      });

      const result = await mechanic.consumeToken(USER_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(result.error.context).toMatchObject({
        limit: 5,
        retryAfterSeconds: expect.any(Number),
      });
    });

    it("should refill tokens when enough time has elapsed (lazy refill)", async () => {
      const now = Date.now();
      const lastRefillAt = now - 10_000; // 10 seconds ago → 2 tokens refilled
      redisService.hGetAll.mockResolvedValue({
        tokens: "0",
        last_refill_at: String(lastRefillAt),
      });
      redisService.hSet.mockResolvedValue(1);

      const result = await mechanic.consumeToken(USER_ID);

      // 0 + 2 refill - 1 consumed = 1
      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.hSet).toHaveBeenCalledWith(key, "tokens", "1");
    });

    it("should not exceed capacity of 5 after refill", async () => {
      const now = Date.now();
      const lastRefillAt = now - 100_000; // 100 seconds ago → 100 tokens would refill, but capped at 5
      redisService.hGetAll.mockResolvedValue({
        tokens: "2",
        last_refill_at: String(lastRefillAt),
      });
      redisService.hSet.mockResolvedValue(1);

      const result = await mechanic.consumeToken(USER_ID);

      // min(5, 2 + 100) - 1 = 4
      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.hSet).toHaveBeenCalledWith(key, "tokens", "4");
    });

    it("should advance last_refill_at proportionally when refill happens", async () => {
      const now = Date.now();
      const lastRefillAt = now - 25_000; // 25 refills of 1s each
      redisService.hGetAll.mockResolvedValue({
        tokens: "1",
        last_refill_at: String(lastRefillAt),
      });
      redisService.hSet.mockResolvedValue(1);

      await mechanic.consumeToken(USER_ID);

      // refillTokens = 25, so last_refill_at should advance by 25 * 1000
      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "last_refill_at",
        String(lastRefillAt + 25_000)
      );
    });

    it("should keep last_refill_at unchanged when no refill happens", async () => {
      const now = Date.now();
      const lastRefillAt = now - 500; // only 500ms elapsed, no full 1s refill
      redisService.hGetAll.mockResolvedValue({
        tokens: "2",
        last_refill_at: String(lastRefillAt),
      });
      redisService.hSet.mockResolvedValue(1);

      await mechanic.consumeToken(USER_ID);

      expect(redisService.hSet).toHaveBeenCalledWith(
        key,
        "last_refill_at",
        String(lastRefillAt)
      );
    });
  });
});
