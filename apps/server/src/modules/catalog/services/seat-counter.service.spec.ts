import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";
import { seatErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { SeatCounterService } from "./seat-counter.service";
import { WorkshopSlotsRepository } from "../repositories/workshop-slots.repository";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SeatCounterService", () => {
  let service: SeatCounterService;
  let redisService: jest.Mocked<RedisService>;
  let workshopSlotsRepo: jest.Mocked<WorkshopSlotsRepository>;

  const workshopId = "w-001";
  const key = "seat:available:w-001";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatCounterService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            incr: jest.fn(),
            decr: jest.fn(),
          },
        },
        {
          provide: WorkshopSlotsRepository,
          useValue: {
            findByWorkshopId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SeatCounterService>(SeatCounterService);
    redisService = module.get(RedisService);
    workshopSlotsRepo = module.get(WorkshopSlotsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // initialize
  // ---------------------------------------------------------------------------
  describe("initialize", () => {
    it("sets the seat counter in Redis to the workshop capacity", async () => {
      redisService.set.mockResolvedValue("OK");

      await service.initialize(workshopId, 30);

      expect(redisService.set).toHaveBeenCalledWith(key, "30");
    });
  });

  // ---------------------------------------------------------------------------
  // getAvailable
  // ---------------------------------------------------------------------------
  describe("getAvailable", () => {
    it("returns value from Redis when available (FR-F04-002)", async () => {
      redisService.get.mockResolvedValue("25");

      const result = await service.getAvailable(workshopId);

      expect(result).toBe(25);
      expect(redisService.get).toHaveBeenCalledWith(key);
      expect(workshopSlotsRepo.findByWorkshopId).not.toHaveBeenCalled();
    });

    it("falls back to DB when Redis key is missing", async () => {
      redisService.get.mockResolvedValue(null);
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(
        Result.ok({
          totalCapacity: 30,
          confirmedCount: 10,
        } as any)
      );

      const result = await service.getAvailable(workshopId);

      expect(result).toBe(20); // 30 - 10
    });

    it("returns 0 when Redis and DB both have no data", async () => {
      redisService.get.mockResolvedValue(null);
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(Result.ok(null));

      const result = await service.getAvailable(workshopId);

      expect(result).toBe(0);
    });

    it("returns 0 when DB query fails", async () => {
      redisService.get.mockResolvedValue(null);
      workshopSlotsRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getAvailable(workshopId);

      expect(result).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // decrement
  // ---------------------------------------------------------------------------
  describe("decrement", () => {
    it("returns ok when counter stays non-negative (FR-F04-002)", async () => {
      redisService.decr.mockResolvedValue(29);

      const result = await service.decrement(workshopId);

      expect(result.isSuccess).toBe(true);
      expect(redisService.decr).toHaveBeenCalledWith(key);
      expect(redisService.incr).not.toHaveBeenCalled();
    });

    it("rolls back and fails when counter goes below 0 (BR-018)", async () => {
      // DECR brings it to -1 (sold out)
      redisService.decr.mockResolvedValue(-1);
      redisService.incr.mockResolvedValue(0);

      const result = await service.decrement(workshopId);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(seatErrors.unavailable(workshopId));
      // Rollback: incr should have been called
      expect(redisService.incr).toHaveBeenCalledWith(key);
    });
  });

  // ---------------------------------------------------------------------------
  // increment
  // ---------------------------------------------------------------------------
  describe("increment", () => {
    it("increments the counter and returns new value", async () => {
      redisService.incr.mockResolvedValue(26);

      const result = await service.increment(workshopId);

      expect(result).toBe(26);
      expect(redisService.incr).toHaveBeenCalledWith(key);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe("delete", () => {
    it("deletes the Redis key", async () => {
      redisService.del.mockResolvedValue(1);

      await service.delete(workshopId);

      expect(redisService.del).toHaveBeenCalledWith(key);
    });

    it("does not fail when key does not exist (idempotent)", async () => {
      redisService.del.mockResolvedValue(0);

      await service.delete(workshopId);

      expect(redisService.del).toHaveBeenCalledWith(key);
    });
  });
});
