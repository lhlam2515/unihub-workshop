import { Test } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";

import { SlidingWindowService } from "./sliding-window.service";
import { RATE_LIMIT_TIERS } from "../constants/rate-limit.constants";

describe("SlidingWindowService", () => {
  let service: SlidingWindowService;
  let mockRedis: Record<string, jest.Mock>;

  beforeEach(async () => {
    // Build a fake pipeline that records commands and returns canned results
    const mockPipeline = {
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 3],
        [null, 1],
        [null, 1],
        [null, 1],
      ]),
    };

    mockRedis = {
      pipeline: jest.fn().mockReturnValue(mockPipeline),
      zrange: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        SlidingWindowService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SlidingWindowService>(SlidingWindowService);
  });

  describe("check() — T2 tier (30 req/min)", () => {
    const tier = "T2";
    const identifier = "user-uuid-123";

    it("allows request when under the limit", async () => {
      const result = await service.check(tier, identifier);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toMatchObject({
        allowed: true,
        remaining: expect.any(Number),
        resetMs: expect.any(Number),
      });
    });

    it("returns decremented remaining count as count increases", async () => {
      // Simulate 1 entry in sorted set → remaining = limit - 1
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 3],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);
      mockRedis.zrange.mockResolvedValueOnce(["1736000000000-abc"]);

      const result = await service.check(tier, identifier);

      expect(result.isSuccess).toBe(true);
      expect(result.data.remaining).toBe(RATE_LIMIT_TIERS[tier].limit - 1);
    });

    it("blocks request when count exceeds the limit", async () => {
      // Simulate 35 entries → over T2 limit (30)
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 3],
        [null, 1],
        [null, 35],
        [null, 1],
      ]);
      mockRedis.zrange.mockResolvedValueOnce(["1736000000000-oldest"]);

      const result = await service.check(tier, identifier);

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(result.error.context).toMatchObject({
        limit: RATE_LIMIT_TIERS[tier].limit,
        tier: "T2",
      });
    });
  });

  describe("fail-open behaviour", () => {
    it("allows request when Redis pipeline throws", async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockRejectedValueOnce(
        new Error("Redis connection lost")
      );

      const result = await service.check("T1", "ip-127.0.0.1");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toMatchObject({
        allowed: true,
      });
    });

    it("allows request when zrange throws after count", async () => {
      mockRedis.zrange.mockRejectedValueOnce(
        new Error("Redis connection lost")
      );

      const result = await service.check("T3", "user-456");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toMatchObject({
        allowed: true,
      });
    });
  });

  describe("reset time calculation", () => {
    it("uses windowMs as fallback when sorted set is empty", async () => {
      mockRedis.zrange.mockResolvedValue([]);

      const result = await service.check("T1", "ip-127.0.0.1");

      expect(result.isSuccess).toBe(true);
      // When set is empty, resetMs = config.windowMs
      expect(result.data.resetMs).toBe(RATE_LIMIT_TIERS.T1.windowMs);
    });

    it("computes resetMs from oldest entry timestamp", async () => {
      const now = Date.now();
      const oldest = now - 10_000; // 10s ago
      mockRedis.zrange.mockResolvedValue([`${oldest}-member`]);

      const result = await service.check("T1", "ip-127.0.0.1");

      expect(result.isSuccess).toBe(true);
      // resetMs = oldest + windowMs - now ≈ windowMs - 10000
      expect(result.data.resetMs).toBeLessThanOrEqual(
        RATE_LIMIT_TIERS.T1.windowMs
      );
    });
  });

  describe("pipeline execution", () => {
    it("executes ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE in a single pipeline", async () => {
      await service.check("T1", "ip-test");

      const pipeline = mockRedis.pipeline();
      expect(pipeline.zremrangebyscore).toHaveBeenCalled();
      expect(pipeline.zadd).toHaveBeenCalled();
      expect(pipeline.zcard).toHaveBeenCalled();
      expect(pipeline.expire).toHaveBeenCalled();
      expect(pipeline.exec).toHaveBeenCalled();
    });

    it("constructs the correct Redis key format for simple identifier", async () => {
      await service.check("T3", "student-uuid");

      const pipeline = mockRedis.pipeline();
      expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
        "rl:tier:T3:student-uuid",
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("constructs the correct Redis key format for composite identifier (T3 user×resource)", async () => {
      await service.check("T3", "student-uuid:workshop-uuid");

      const pipeline = mockRedis.pipeline();
      expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
        "rl:tier:T3:student-uuid:workshop-uuid",
        expect.any(Number),
        expect.any(Number)
      );
    });
  });
});
