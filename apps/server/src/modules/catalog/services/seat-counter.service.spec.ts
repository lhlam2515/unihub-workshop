import { Test, type TestingModule } from "@nestjs/testing";

import { RedisService } from "@/infra/redis/redis.service";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { Result } from "@/shared/response/result";

import { SeatCounterService } from "./seat-counter.service";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SeatCounterService", () => {
  let service: SeatCounterService;
  let redisService: jest.Mocked<RedisService>;
  let workshopsRepo: jest.Mocked<WorkshopsRepository>;

  const workshopId = "w-001";
  const key = "cache:workshop:w-001:seats";

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
          },
        },
        {
          provide: WorkshopsRepository,
          useValue: {
            getSeatVersion: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SeatCounterService>(SeatCounterService);
    redisService = module.get(RedisService);
    workshopsRepo = module.get(WorkshopsRepository);
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

      expect(redisService.set).toHaveBeenCalledWith(key, "30", 10);
    });
  });

  // ---------------------------------------------------------------------------
  // getCachedSeats
  // ---------------------------------------------------------------------------
  describe("getCachedSeats", () => {
    it("returns value from Redis when available (FR-F04-002)", async () => {
      redisService.get.mockResolvedValue("25");

      const result = await service.getCachedSeats(workshopId);

      expect(result).toBe(25);
      expect(redisService.get).toHaveBeenCalledWith(key);
      expect(workshopsRepo.getSeatVersion).not.toHaveBeenCalled();
    });

    it("falls back to DB when Redis key is missing", async () => {
      redisService.get.mockResolvedValue(null);
      workshopsRepo.getSeatVersion.mockResolvedValue(
        Result.ok({ version: 1, seatsAvailable: 30 })
      );

      const result = await service.getCachedSeats(workshopId);

      expect(result).toBe(30);
      expect(redisService.set).toHaveBeenCalledWith(key, "30", 10);
    });

    it("returns 0 when Redis and DB both have no data", async () => {
      redisService.get.mockResolvedValue(null);
      workshopsRepo.getSeatVersion.mockResolvedValue(Result.ok(null));

      const result = await service.getCachedSeats(workshopId);

      expect(result).toBe(0);
    });

    it("returns 0 when DB query fails", async () => {
      redisService.get.mockResolvedValue(null);
      workshopsRepo.getSeatVersion.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getCachedSeats(workshopId);

      expect(result).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // invalidateCache
  // ---------------------------------------------------------------------------
  describe("invalidateCache", () => {
    it("deletes the Redis cache key", async () => {
      redisService.del.mockResolvedValue(1);

      await service.invalidateCache(workshopId);

      expect(redisService.del).toHaveBeenCalledWith(key);
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
