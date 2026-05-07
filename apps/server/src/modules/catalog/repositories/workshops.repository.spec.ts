import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";

import { WorkshopsRepository } from "./workshops.repository";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockWorkshop = {
  workshopId: "w-001",
  title: "Intro to Testing",
  description: "Learn testing",
  speakerId: "s-001",
  roomId: "r-001",
  startsAt: new Date("2026-06-01T09:00:00Z"),
  endsAt: new Date("2026-06-01T11:00:00Z"),
  capacity: 30,
  isPaid: false,
  price: null,
  status: "PUBLISHED" as const,
  createdBy: "u-001",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

const mockSpeaker = {
  speakerId: "s-001",
  fullName: "John Doe",
  title: "Expert",
  bio: "Bio text",
  avatarUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

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

const mockSlot = {
  workshopId: "w-001",
  totalCapacity: 30,
  lockedCount: 2,
  confirmedCount: 10,
};

// ---------------------------------------------------------------------------
// Chainable mock factory
//
// Drizzle query chains like db.select().from(t).where(...) return a query
// builder that is then awaited.  Our mock makes the chainable a thenable:
// each `await chainable` dequeues and resolves the next value from the
// resolvers queue.  Multi-query methods (findPublished, listAdmin) push
// one value per query in order.
// ---------------------------------------------------------------------------

function createMockDb() {
  const resolvers: Array<() => any> = [];

  const chainable = {
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
    onConflictDoUpdate: jest.fn().mockReturnThis(),

    // Make the chainable a thenable: each await dequeues the next resolver
    then(
      onFulfilled: (v: any) => any,
      onRejected?: (v: any) => any
    ): Promise<any> {
      const resolver = resolvers.shift();
      if (resolver) {
        try {
          return Promise.resolve(resolver()).then(onFulfilled);
        } catch (err) {
          return Promise.reject(err as Error).then(undefined, onRejected);
        }
      }
      return Promise.resolve(undefined).then(onFulfilled);
    },

    pushResolve(val: any): void {
      resolvers.push(() => val);
    },
    pushReject(err: any): void {
      resolvers.push(() => {
        throw err;
      });
    },
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

describe("WorkshopsRepository", () => {
  let repo: WorkshopsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      workshops: {
        workshopId: "workshopId",
        status: "status",
        startsAt: "startsAt",
        endsAt: "endsAt",
        createdAt: "createdAt",
      },
      speakers: { speakerId: "speakerId" },
      rooms: { roomId: "roomId" },
      workshopSlots: { workshopId: "workshopId" },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<WorkshopsRepository>(WorkshopsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------
  describe("findById", () => {
    it("returns the workshop with joined speaker and room when found (FR-F02-001)", async () => {
      const row = {
        workshops: mockWorkshop,
        speakers: mockSpeaker,
        rooms: mockRoom,
      };
      mockChain.pushResolve([row]);

      const result = await repo.findById("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(row);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockChain.where).toHaveBeenCalled();
    });

    it("returns null when workshop is not found", async () => {
      mockChain.pushResolve([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.pushReject(new Error("DB down"));

      const result = await repo.findById("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(new Error("DB down")));
    });
  });

  // -----------------------------------------------------------------------
  // findByIdAndStatus
  // -----------------------------------------------------------------------
  describe("findByIdAndStatus", () => {
    it("returns the workshop when found with matching status", async () => {
      mockChain.pushResolve([mockWorkshop]);

      const result = await repo.findByIdAndStatus("w-001", "PUBLISHED");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockWorkshop);
    });

    it("returns null when status does not match", async () => {
      mockChain.pushResolve([]);

      const result = await repo.findByIdAndStatus("w-001", "DRAFT");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.pushReject(new Error("DB error"));

      const result = await repo.findByIdAndStatus("w-001", "PUBLISHED");

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // findPublished
  // -----------------------------------------------------------------------
  describe("findPublished", () => {
    const defaultFilters = { page: 1, limit: 20 };

    it("returns published workshops with pagination and total count (FR-F02-006)", async () => {
      // Two sequential queries: count then items
      mockChain.pushResolve([{ count: "1" }]);
      mockChain.pushResolve([
        { workshops: mockWorkshop, speakers: mockSpeaker, rooms: mockRoom },
      ]);

      const result = await repo.findPublished(defaultFilters);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.total).toBe(1);
        expect(result.data.items).toHaveLength(1);
      }
    });

    it("applies date and payment filters when provided", async () => {
      mockChain.pushResolve([{ count: "0" }]);
      mockChain.pushResolve([]);

      const filters = {
        ...defaultFilters,
        dateFrom: new Date("2026-06-01"),
        dateTo: new Date("2026-06-30"),
        isPaid: false,
      };

      const result = await repo.findPublished(filters);

      expect(result.isSuccess).toBe(true);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.pushReject(new Error("DB error"));

      const result = await repo.findPublished(defaultFilters);

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // listAdmin
  // -----------------------------------------------------------------------
  describe("listAdmin", () => {
    const defaultFilters = { page: 1, limit: 20 };

    it("returns all workshops with slot, speaker, and room joins", async () => {
      mockChain.pushResolve([{ count: "1" }]);
      mockChain.pushResolve([
        {
          workshops: mockWorkshop,
          workshopSlots: mockSlot,
          speakers: mockSpeaker,
          rooms: mockRoom,
        },
      ]);

      const result = await repo.listAdmin(defaultFilters);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.total).toBe(1);
        expect(result.data.items).toHaveLength(1);
      }
    });

    it("filters by status when provided", async () => {
      mockChain.pushResolve([{ count: "0" }]);
      mockChain.pushResolve([]);

      const result = await repo.listAdmin({
        ...defaultFilters,
        status: "DRAFT",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("returns FailResult on DB error", async () => {
      mockChain.pushReject(new Error("DB error"));

      const result = await repo.listAdmin(defaultFilters);

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("inserts a new workshop and returns it", async () => {
      mockChain.pushResolve([mockWorkshop]);

      const result = await repo.create(mockWorkshop);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockWorkshop);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.workshops);
    });

    it("returns FailResult on insert error", async () => {
      mockChain.pushReject(new Error("Insert failed"));

      const result = await repo.create(mockWorkshop);

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe("update", () => {
    it("updates a workshop and returns it", async () => {
      const updated = { ...mockWorkshop, title: "Updated Title" };
      mockChain.pushResolve([updated]);

      const result = await repo.update("w-001", { title: "Updated Title" });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("returns FailResult on update error", async () => {
      mockChain.pushReject(new Error("Update failed"));

      const result = await repo.update("w-001", { title: "Updated" });

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates only the status column", async () => {
      const updated = { ...mockWorkshop, status: "PUBLISHED" };
      mockChain.pushResolve([updated]);

      const result = await repo.updateStatus("w-001", "PUBLISHED");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("PUBLISHED");
    });

    it("returns FailResult on DB error", async () => {
      mockChain.pushReject(new Error("DB error"));

      const result = await repo.updateStatus("w-001", "CANCELLED");

      expect(result.isFailure).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // completePastPublished
  // -----------------------------------------------------------------------
  describe("completePastPublished", () => {
    it("returns the count of transitioned workshops (FR-F10-005)", async () => {
      // Chain: update().set().where() -- .where() is the terminal, one await
      mockChain.pushResolve({ rowCount: 5 });

      const result = await repo.completePastPublished();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(5);
      }
    });

    it("returns 0 when no workshops are eligible", async () => {
      mockChain.pushResolve({ rowCount: 0 });

      const result = await repo.completePastPublished();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toBe(0);
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.pushReject(new Error("DB error"));

      const result = await repo.completePastPublished();

      expect(result.isFailure).toBe(true);
    });
  });
});
