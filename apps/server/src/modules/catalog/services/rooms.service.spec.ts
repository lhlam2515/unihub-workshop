import { Test, type TestingModule } from "@nestjs/testing";

import { roomErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { RoomsService } from "./rooms.service";
import { RoomResponseBuilder } from "../dto/room-response.dto";
import { RoomsRepository } from "../repositories/rooms.repository";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRoomEntity = {
  roomId: "r-001",
  name: "Room A",
  building: "Building 1",
  floor: 2,
  capacity: 50,
  floorPlanUrl: null,
  facilities: { projector: true, wifi: true },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockRoomDto = RoomResponseBuilder.from(mockRoomEntity);

const createDto = {
  name: "Room A",
  building: "Building 1",
  floor: 2,
  capacity: 50,
  floor_plan_url: undefined,
  facilities: { projector: true, wifi: true },
};

const updateDto = { name: "Updated Room" };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RoomsService", () => {
  let service: RoomsService;
  let roomsRepo: jest.Mocked<RoomsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: RoomsRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findConflicting: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
    roomsRepo = module.get(RoomsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // listRooms
  // ---------------------------------------------------------------------------
  describe("listRooms", () => {
    it("returns all rooms as DTOs", async () => {
      roomsRepo.findAll.mockResolvedValue(Result.ok([mockRoomEntity]));

      const result = await service.listRooms();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockRoomDto]);
      }
    });

    it("proxies repository failure", async () => {
      roomsRepo.findAll.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.listRooms();

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createRoom
  // ---------------------------------------------------------------------------
  describe("createRoom", () => {
    it("creates a room and returns its DTO", async () => {
      roomsRepo.create.mockResolvedValue(Result.ok(mockRoomEntity));

      const result = await service.createRoom(createDto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual(mockRoomDto);
      }
      expect(roomsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Room A",
          capacity: 50,
          facilities: { projector: true, wifi: true },
        })
      );
    });

    it("passes facilities object to JSONB storage", async () => {
      roomsRepo.create.mockResolvedValue(Result.ok(mockRoomEntity));

      await service.createRoom(createDto);

      expect(roomsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          facilities: { projector: true, wifi: true },
        })
      );
    });

    it("sets facilities to null when not provided", async () => {
      roomsRepo.create.mockResolvedValue(Result.ok(mockRoomEntity));
      const dtoNoFacilities = { ...createDto, facilities: undefined };

      await service.createRoom(dtoNoFacilities);

      expect(roomsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ facilities: null })
      );
    });

    it("proxies repository failure", async () => {
      roomsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.createRoom(createDto);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateRoom
  // ---------------------------------------------------------------------------
  describe("updateRoom", () => {
    it("updates a room and returns its DTO", async () => {
      const updatedEntity = { ...mockRoomEntity, name: "Updated Room" };
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoomEntity));
      roomsRepo.update.mockResolvedValue(Result.ok(updatedEntity));

      const result = await service.updateRoom("r-001", updateDto);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.name).toBe("Updated Room");
      }
    });

    it("fails when room does not exist", async () => {
      roomsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.updateRoom("nonexistent", updateDto);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(roomErrors.notFound("nonexistent"));
    });

    it("fails when findById returns failure", async () => {
      roomsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateRoom("r-001", updateDto);

      expect(result.isFailure).toBe(true);
    });

    it("proxies update failure", async () => {
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoomEntity));
      roomsRepo.update.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateRoom("r-001", updateDto);

      expect(result.isFailure).toBe(true);
    });

    it("passes facilities object to JSONB storage on update", async () => {
      roomsRepo.findById.mockResolvedValue(Result.ok(mockRoomEntity));
      roomsRepo.update.mockResolvedValue(Result.ok(mockRoomEntity));
      const dto = { facilities: { wifi: true } };

      await service.updateRoom("r-001", dto);

      expect(roomsRepo.update).toHaveBeenCalledWith(
        "r-001",
        expect.objectContaining({ facilities: { wifi: true } })
      );
    });
  });
});
