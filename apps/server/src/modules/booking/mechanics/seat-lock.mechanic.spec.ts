import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/shared/redis/redis.service";

import { SeatLockMechanic } from "./seat-lock.mechanic";

describe("SeatLockMechanic", () => {
  let mechanic: SeatLockMechanic;
  let redisService: jest.Mocked<RedisService>;

  const WORKSHOP_ID = "w-001";
  const REGISTRATION_ID = "reg-001";
  const STUDENT_ID = "stu-001";
  const AMOUNT = 50000;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatLockMechanic,
        {
          provide: RedisService,
          useValue: {
            setNx: jest.fn(),
            del: jest.fn(),
            ttl: jest.fn(),
          },
        },
      ],
    }).compile();

    mechanic = module.get<SeatLockMechanic>(SeatLockMechanic);
    redisService = module.get(RedisService);
  });

  const expectedKey = `seat:lock:${WORKSHOP_ID}:${REGISTRATION_ID}`;

  describe("acquire — FR-F04-004 (seat lock with TTL 900s)", () => {
    it("should acquire lock when SET NX succeeds", async () => {
      redisService.setNx.mockResolvedValue(true);

      const result = await mechanic.acquire(
        WORKSHOP_ID,
        REGISTRATION_ID,
        STUDENT_ID,
        AMOUNT
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.setNx).toHaveBeenCalledWith(
        expectedKey,
        JSON.stringify({ studentId: STUDENT_ID }),
        900
      );
    });

    it("should return SEAT_LOCK_EXPIRED when SET NX fails (BR-021)", async () => {
      redisService.setNx.mockResolvedValue(false);

      const result = await mechanic.acquire(
        WORKSHOP_ID,
        REGISTRATION_ID,
        STUDENT_ID,
        AMOUNT
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
    });
  });

  describe("release", () => {
    it("should delete the key and return OkResult(true)", async () => {
      redisService.del.mockResolvedValue(1);

      const result = await mechanic.release(WORKSHOP_ID, REGISTRATION_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith(expectedKey);
    });

    it("should succeed even if key does not exist (idempotent)", async () => {
      redisService.del.mockResolvedValue(0);

      const result = await mechanic.release(WORKSHOP_ID, REGISTRATION_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(true);
    });
  });

  describe("check", () => {
    it("should return valid=true + remainingSeconds when TTL > 0", async () => {
      redisService.ttl.mockResolvedValue(500);

      const result = await mechanic.check(WORKSHOP_ID, REGISTRATION_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual({ valid: true, remainingSeconds: 500 });
    });

    it("should return SEAT_LOCK_EXPIRED when TTL <= 0", async () => {
      redisService.ttl.mockResolvedValue(0);

      const result = await mechanic.check(WORKSHOP_ID, REGISTRATION_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
    });

    it("should return SEAT_LOCK_EXPIRED when TTL is negative (key missing)", async () => {
      redisService.ttl.mockResolvedValue(-2);

      const result = await mechanic.check(WORKSHOP_ID, REGISTRATION_ID);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("SEAT_LOCK_EXPIRED");
    });
  });
});
