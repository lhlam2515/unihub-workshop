import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/shared/redis/redis.service";

import { IdempotencyMechanic } from "./idempotency.mechanic";

describe("IdempotencyMechanic", () => {
  let mechanic: IdempotencyMechanic;
  let redisService: jest.Mocked<RedisService>;

  const IDEMPOTENCY_KEY = "idem-key-001";
  const PAYMENT_ID = "pay-001";
  const expectedKey = `idempotency:${IDEMPOTENCY_KEY}`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyMechanic,
        {
          provide: RedisService,
          useValue: {
            setNx: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<IdempotencyMechanic>(IdempotencyMechanic);
    redisService = module.get(RedisService);
  });

  describe("check — FR-F05-001 (idempotency Layer 1, SET NX 24h TTL)", () => {
    it("should return proceed:true for a new key", async () => {
      redisService.setNx.mockResolvedValue(true);

      const result = await mechanic.check(IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ proceed: true });
      expect(redisService.setNx).toHaveBeenCalledWith(
        expectedKey,
        "pending",
        86400
      );
    });

    it("should return proceed:false with existingPaymentId for an existing key", async () => {
      redisService.setNx.mockResolvedValue(false);
      redisService.get.mockResolvedValue(PAYMENT_ID);

      const result = await mechanic.check(IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        proceed: false,
        existingPaymentId: PAYMENT_ID,
      });
    });

    it("should return existingPaymentId as undefined when value is null on existing key", async () => {
      redisService.setNx.mockResolvedValue(false);
      redisService.get.mockResolvedValue(null);

      const result = await mechanic.check(IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({
        proceed: false,
        existingPaymentId: undefined,
      });
    });

    it("should gracefully degrade (proceed:true) when Redis fails", async () => {
      redisService.setNx.mockRejectedValue(new Error("Redis connection lost"));

      const result = await mechanic.check(IDEMPOTENCY_KEY);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ proceed: true });
    });
  });

  describe("setPaymentId", () => {
    it("should update placeholder to actual payment_id with TTL", async () => {
      redisService.set.mockResolvedValue("OK");

      await mechanic.setPaymentId(IDEMPOTENCY_KEY, PAYMENT_ID);

      expect(redisService.set).toHaveBeenCalledWith(
        expectedKey,
        PAYMENT_ID,
        86400
      );
    });
  });
});
