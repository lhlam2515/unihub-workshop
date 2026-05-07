import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";

import { GlobalRateLimitMechanic } from "./global-rate-limit.mechanic";

describe("GlobalRateLimitMechanic", () => {
  let mechanic: GlobalRateLimitMechanic;
  let redisService: jest.Mocked<RedisService>;

  const KEY = "ratelimit:global:register";
  const THRESHOLD = 500;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalRateLimitMechanic,
        {
          provide: RedisService,
          useValue: {
            incr: jest.fn(),
            expire: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<GlobalRateLimitMechanic>(GlobalRateLimitMechanic);
    redisService = module.get(RedisService);
  });

  describe("check — FR-F04-001 (500 req/s global limit, BR-017)", () => {
    it("should allow request when under 500 threshold", async () => {
      redisService.incr.mockResolvedValue(100);

      const result = await mechanic.check();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
    });

    it("should set 1s expiry on the first request of the window", async () => {
      redisService.incr.mockResolvedValue(1);

      await mechanic.check();

      expect(redisService.expire).toHaveBeenCalledWith(KEY, 1);
    });

    it("should not set expiry on subsequent requests", async () => {
      redisService.incr.mockResolvedValue(50);
      redisService.expire.mockResolvedValue(true);

      await mechanic.check();

      expect(redisService.expire).not.toHaveBeenCalled();
    });

    it("should return RATE_LIMIT_EXCEEDED when over 500 threshold", async () => {
      redisService.incr.mockResolvedValue(501);

      const result = await mechanic.check();

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(result.error.context).toMatchObject({
        limit: THRESHOLD,
        retryAfterSeconds: 1,
      });
    });

    it("should return RATE_LIMIT_EXCEEDED exactly at 501", async () => {
      redisService.incr.mockResolvedValue(501);

      const result = await mechanic.check();

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should still try to set expiry when counter is exactly 1", async () => {
      redisService.incr.mockResolvedValue(1);

      await mechanic.check();

      expect(redisService.expire).toHaveBeenCalledWith(KEY, 1);
    });
  });
});
