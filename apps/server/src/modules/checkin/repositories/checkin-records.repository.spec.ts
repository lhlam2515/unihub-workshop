import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { systemErrors } from "@/shared/response/errors";

import { CheckinRecordsRepository } from "./checkin-records.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  let resolveValue: any = [];

  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: any) => resolve(resolveValue)),
  };

  const db: any = {
    insert: jest.fn().mockReturnValue(chainable),
    select: jest.fn().mockReturnValue(chainable),
    query: {
      checkinRecords: {
        findMany: jest.fn(),
      },
    },
  };

  return {
    db,
    chainable,
    setResult: (v: any) => {
      resolveValue = v;
    },
  };
}

const mockRecord = {
  checkinId: "ci-001",
  registrationId: "reg-001",
  ticketId: "tkt-001",
  studentId: "stu-001",
  workshopId: "w-001",
  checkedInAt: new Date("2026-06-01T10:00:00Z"),
  checkedInBy: "staff-001",
  source: "ONLINE",
  deviceId: null,
  syncedAt: null,
  createdAt: new Date("2026-06-01T10:00:00Z"),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("CheckinRecordsRepository", () => {
  let repo: CheckinRecordsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let setResult: (v: any) => void;
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable, setResult: sr } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    setResult = sr;
    mockSchema = {
      checkinRecords: { workshopId: "workshopId", checkedInAt: "checkedInAt" },
      registrations: { workshopId: "workshopId" },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinRecordsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<CheckinRecordsRepository>(CheckinRecordsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("inserts a new checkin record and returns it (FR-F07-002)", async () => {
      mockChain.returning.mockResolvedValue([mockRecord]);

      const result = await repo.create({
        registrationId: "reg-001",
        ticketId: "tkt-001",
        studentId: "stu-001",
        workshopId: "w-001",
        checkedInAt: new Date("2026-06-01T10:00:00Z"),
        checkedInBy: "staff-001",
        source: "ONLINE",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockRecord);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.checkinRecords);
      expect(mockChain.onConflictDoNothing).toHaveBeenCalled();
    });

    it("returns null when a duplicate is silently ignored", async () => {
      mockChain.returning.mockResolvedValue([]);

      const result = await repo.create({
        registrationId: "reg-001",
        ticketId: "tkt-001",
        studentId: "stu-001",
        workshopId: "w-001",
        checkedInAt: new Date("2026-06-01T10:00:00Z"),
        checkedInBy: "staff-001",
        source: "ONLINE",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.create({
        registrationId: "reg-001",
        ticketId: "tkt-001",
        studentId: "stu-001",
        workshopId: "w-001",
        checkedInAt: new Date("2026-06-01T10:00:00Z"),
        checkedInBy: "staff-001",
        source: "ONLINE",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByWorkshopId
  // -----------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns recent checkin records with student details", async () => {
      const rows = [
        {
          ...mockRecord,
          student: {
            studentId: "stu-001",
            fullName: "John Doe",
            studentCode: "STU001",
          },
        },
      ];
      mockDb.query.checkinRecords.findMany.mockResolvedValue(rows);

      const result = await repo.findByWorkshopId("w-001", 20);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(rows);
      expect(mockDb.query.checkinRecords.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
          orderBy: expect.anything(),
          limit: 20,
          with: { student: true },
        })
      );
    });

    it("returns FailResult when DB query throws", async () => {
      mockDb.query.checkinRecords.findMany.mockRejectedValue(
        new Error("DB down")
      );

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // countByWorkshopId
  // -----------------------------------------------------------------------
  describe("countByWorkshopId", () => {
    it("returns the count of checkin records for a workshop", async () => {
      setResult([{ count: 5 }]);

      const result = await repo.countByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(5);
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.select.mockRejectedValue(new Error("DB down"));

      const result = await repo.countByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // countConfirmedRegistrationsByWorkshopId
  // -----------------------------------------------------------------------
  describe("countConfirmedRegistrationsByWorkshopId", () => {
    it("returns the confirmed registration count for a workshop", async () => {
      setResult([{ count: 10 }]);

      const result =
        await repo.countConfirmedRegistrationsByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe(10);
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.select.mockRejectedValue(new Error("DB down"));

      const result =
        await repo.countConfirmedRegistrationsByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
