import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { StudentSyncErrorsRepository } from "./student-sync-errors.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    then: undefined,
  };

  const db: any = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

const mockError = {
  errorId: "err-001",
  jobId: "job-001",
  rowNumber: 1,
  rawData: JSON.stringify({ student_code: "" }),
  errorReason: "MISSING_FIELD",
  errorDetail: "student_code is required",
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

const mockSchema: any = {
  studentSyncErrors: {
    jobId: "jobId",
    rowNumber: "rowNumber",
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StudentSyncErrorsRepository", () => {
  let repo: StudentSyncErrorsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentSyncErrorsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<StudentSyncErrorsRepository>(StudentSyncErrorsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // createBatch
  // -----------------------------------------------------------------------
  describe("createBatch", () => {
    it("inserts multiple error records in batch", async () => {
      mockChain.returning.mockResolvedValue([mockError]);

      const result = await repo.createBatch([mockError]);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.studentSyncErrors);
      expect(mockChain.values).toHaveBeenCalledWith([mockError]);
    });

    it("returns empty array when batch is empty", async () => {
      mockChain.returning.mockResolvedValue([]);

      const result = await repo.createBatch([]);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.createBatch([mockError]);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByJobId
  // -----------------------------------------------------------------------
  describe("findByJobId", () => {
    it("returns paginated errors for a job", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([mockError]);
        else resolve([{ count: "1" }]);
      };

      const result = await repo.findByJobId("job-001", {
        page: 1,
        limit: 20,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });

    it("returns empty items when job has no errors", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([]);
        else resolve([{ count: "0" }]);
      };

      const result = await repo.findByJobId("job-001", {
        page: 1,
        limit: 20,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toEqual([]);
      expect(result.data.total).toBe(0);
    });

    it("returns FailResult when DB query throws", async () => {
      let callCount = 0;
      mockChain.then = (_resolve: any, reject: any) => {
        callCount++;
        if (callCount === 1) reject(new Error("DB down"));
      };

      const result = await repo.findByJobId("job-001", {
        page: 1,
        limit: 20,
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
