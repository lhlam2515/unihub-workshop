import { Test, type TestingModule } from "@nestjs/testing";
import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { RoomsRepository } from "../repositories/rooms.repository";
import { RoomConflictService } from "./room-conflict.service";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RoomConflictService", () => {
  let service: RoomConflictService;
  let roomsRepo: jest.Mocked<RoomsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomConflictService,
        {
          provide: RoomsRepository,
          useValue: {
            findConflicting: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RoomConflictService>(RoomConflictService);
    roomsRepo = module.get(RoomsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // checkConflict
  // ---------------------------------------------------------------------------
  describe("checkConflict", () => {
    const roomId = "r-001";
    const startsAt = new Date("2026-06-01T09:00:00Z");
    const endsAt = new Date("2026-06-01T11:00:00Z");

    it("returns ok when no conflict exists (FR-F02-002)", async () => {
      roomsRepo.findConflicting.mockResolvedValue(Result.ok([]));

      const result = await service.checkConflict(roomId, startsAt, endsAt);

      expect(result.isSuccess).toBe(true);
    });

    it("fails with WORKSHOP_TIME_CONFLICT when overlap is found (FR-F02-002)", async () => {
      const conflictingWorkshop = { workshopId: "w-002", title: "Conflicting" };
      roomsRepo.findConflicting.mockResolvedValue(
        Result.ok([conflictingWorkshop as any])
      );

      const result = await service.checkConflict(roomId, startsAt, endsAt);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(
        workshopErrors.roomConflict(
          roomId,
          startsAt.toISOString(),
          endsAt.toISOString()
        )
      );
    });

    it("excludes self when excludeWorkshopId is provided", async () => {
      roomsRepo.findConflicting.mockResolvedValue(Result.ok([]));

      const result = await service.checkConflict(
        roomId,
        startsAt,
        endsAt,
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(roomsRepo.findConflicting).toHaveBeenCalledWith(
        roomId,
        startsAt,
        endsAt,
        "w-001"
      );
    });

    it("proxies repository failure", async () => {
      roomsRepo.findConflicting.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.checkConflict(roomId, startsAt, endsAt);

      expect(result.isFailure).toBe(true);
    });
  });
});
