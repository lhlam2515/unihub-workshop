import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { WorkshopSlotsRepository } from "./workshop-slots.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSlot = {
  workshopId: "w-001",
  totalCapacity: 30,
  lockedCount: 2,
  confirmedCount: 10,
};

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    then: undefined,
  };

  const db = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WorkshopSlotsRepository", () => {
  let repo: WorkshopSlotsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      workshopSlots: {
        workshopId: "workshopId",
        confirmedCount: "confirmedCount",
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopSlotsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<WorkshopSlotsRepository>(WorkshopSlotsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findByWorkshopId
  // ---------------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns the slot when found", async () => {
      mockChain.limit.mockResolvedValue([mockSlot]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSlot);
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findByWorkshopId("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe("create", () => {
    it("creates a slot with initialised counters", async () => {
      mockChain.returning.mockResolvedValue([mockSlot]);

      const result = await repo.create("w-001", 30);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSlot);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create("w-001", 30);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // incrementConfirmed
  // ---------------------------------------------------------------------------
  describe("incrementConfirmed", () => {
    it("atomically increments confirmed count", async () => {
      const updated = { ...mockSlot, confirmedCount: 11 };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.incrementConfirmed("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.confirmedCount).toBe(11);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.incrementConfirmed("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // decrementConfirmed
  // ---------------------------------------------------------------------------
  describe("decrementConfirmed", () => {
    it("atomically decrements confirmed count", async () => {
      const updated = { ...mockSlot, confirmedCount: 9 };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.decrementConfirmed("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.confirmedCount).toBe(9);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.decrementConfirmed("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // reconcile
  // ---------------------------------------------------------------------------
  describe("reconcile", () => {
    it("overwrites locked and confirmed counts", async () => {
      const reconciled = { ...mockSlot, lockedCount: 0, confirmedCount: 8 };
      mockChain.returning.mockResolvedValue([reconciled]);

      const result = await repo.reconcile("w-001", 999, 0, 8);

      expect(result.isSuccess).toBe(true);
      expect(result.data.lockedCount).toBe(0);
      expect(result.data.confirmedCount).toBe(8);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.reconcile("w-001", 999, 0, 8);

      expect(result.isFailure).toBe(true);
    });
  });
});
