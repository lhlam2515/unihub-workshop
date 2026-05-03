import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { RoomsRepository } from "./rooms.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRoom = {
  roomId: "r-001",
  name: "Room A",
  building: "Building 1",
  floor: 2,
  capacity: 50,
  floorPlanUrl: null,
  facilities: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockWorkshop = {
  workshopId: "w-001",
  roomId: "r-001",
  status: "PUBLISHED",
  startsAt: new Date("2026-06-01T09:00:00Z"),
  endsAt: new Date("2026-06-01T11:00:00Z"),
};

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    then: undefined,
  };

  const db = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
    delete: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RoomsRepository", () => {
  let repo: RoomsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      rooms: { roomId: "roomId", createdAt: "createdAt" },
      workshops: {
        workshopId: "workshopId",
        roomId: "roomId",
        status: "status",
        startsAt: "startsAt",
        endsAt: "endsAt",
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<RoomsRepository>(RoomsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe("findAll", () => {
    it("returns all rooms ordered by createdAt descending", async () => {
      mockChain.orderBy.mockResolvedValue([mockRoom]);

      const result = await repo.findAll();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockRoom]);
      }
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns empty array when no rooms exist", async () => {
      mockChain.orderBy.mockResolvedValue([]);

      const result = await repo.findAll();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.orderBy.mockRejectedValue(new Error("DB error"));

      const result = await repo.findAll();

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe("findById", () => {
    it("returns a room when found", async () => {
      mockChain.limit.mockResolvedValue([mockRoom]);

      const result = await repo.findById("r-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRoom);
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findById("r-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe("create", () => {
    it("inserts a room and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockRoom]);

      const result = await repo.create(mockRoom);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRoom);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.rooms);
    });

    it("returns FailResult on insert error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create(mockRoom);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findConflicting
  // ---------------------------------------------------------------------------
  describe("findConflicting", () => {
    it("returns conflicting workshops when overlaps exist (FR-F02-002)", async () => {
      mockChain.where.mockResolvedValue([mockWorkshop]);

      const result = await repo.findConflicting(
        "r-001",
        new Date("2026-06-01T08:00:00Z"),
        new Date("2026-06-01T12:00:00Z")
      );

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual(mockWorkshop);
      }
    });

    it("returns empty array when no conflicts", async () => {
      mockChain.where.mockResolvedValue([]);

      const result = await repo.findConflicting(
        "r-001",
        new Date("2026-07-01T08:00:00Z"),
        new Date("2026-07-01T12:00:00Z")
      );

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("excludes the specified workshopId on update", async () => {
      mockChain.where.mockResolvedValue([]);

      const result = await repo.findConflicting(
        "r-001",
        new Date("2026-06-01T08:00:00Z"),
        new Date("2026-06-01T12:00:00Z"),
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.where.mockRejectedValue(new Error("DB error"));

      const result = await repo.findConflicting(
        "r-001",
        new Date("2026-06-01T08:00:00Z"),
        new Date("2026-06-01T12:00:00Z")
      );

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe("update", () => {
    it("updates a room and returns it", async () => {
      const updated = { ...mockRoom, name: "Updated Room" };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.update("r-001", { name: "Updated Room" });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("returns FailResult on update error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Update failed"));

      const result = await repo.update("r-001", { name: "Updated" });

      expect(result.isFailure).toBe(true);
    });
  });
});
