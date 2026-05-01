import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { StudentSyncJobsRepository } from "./student-sync-jobs.repository";

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
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: any) => resolve(resolveValue)),
  };

  const db: any = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
  };

  return {
    db,
    chainable,
    setResult: (v: any) => {
      resolveValue = v;
    },
  };
}

const mockJob = {
  jobId: "job-001",
  sourceFileName: "students-2026-06-01.csv",
  status: "RUNNING" as const,
  totalRows: null,
  processedRows: null,
  errorRows: null,
  triggeredAt: new Date("2026-06-01T00:00:00Z"),
  completedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const mockSchema: any = {
  studentSyncJobs: {
    jobId: "jobId",
    status: "status",
    sourceFileName: "sourceFileName",
    triggeredAt: "triggeredAt",
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StudentSyncJobsRepository", () => {
  let repo: StudentSyncJobsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let setResult: (v: any) => void;

  beforeEach(async () => {
    const { db, chainable, setResult: sr } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    setResult = sr;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentSyncJobsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<StudentSyncJobsRepository>(StudentSyncJobsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------
  describe("findById", () => {
    it("returns the job when found", async () => {
      setResult([mockJob]);

      const result = await repo.findById("job-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockJob);
    });

    it("returns null when job not found", async () => {
      setResult([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      // Override default then mock to reject — jest.fn mockResolvedValue/mockRejectedValue
      // on a thenable doesn't propagate to await so we replace the implementation
      mockChain.then = (_resolve: any, reject: any) =>
        reject(new Error("DB down"));

      const result = await repo.findById("job-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("inserts a new sync job and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockJob]);

      const result = await repo.create({
        sourceFileName: "students-2026-06-01.csv",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockJob);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.studentSyncJobs);
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.create({
        sourceFileName: "students-2026-06-01.csv",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates status to SUCCESS with counts and sets completedAt", async () => {
      const completed = {
        ...mockJob,
        status: "SUCCESS" as const,
        totalRows: 100,
        processedRows: 100,
        errorRows: 0,
        completedAt: new Date(),
      };
      mockChain.returning.mockResolvedValue([completed]);

      const result = await repo.updateStatus("job-001", "SUCCESS", {
        totalRows: 100,
        processedRows: 100,
        errorRows: 0,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SUCCESS");
      expect(mockChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "SUCCESS",
          completedAt: expect.any(Date),
        })
      );
    });

    it("updates status to RUNNING without counts or completedAt", async () => {
      const running = { ...mockJob, status: "RUNNING" as const };
      mockChain.returning.mockResolvedValue([running]);

      const result = await repo.updateStatus("job-001", "RUNNING");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("RUNNING");
      expect(mockChain.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ completedAt: expect.any(Date) })
      );
    });

    it("sets completedAt for terminal status PARTIAL_FAILURE", async () => {
      const partial = {
        ...mockJob,
        status: "PARTIAL_FAILURE" as const,
        totalRows: 100,
        processedRows: 80,
        errorRows: 20,
        completedAt: new Date(),
      };
      mockChain.returning.mockResolvedValue([partial]);

      const result = await repo.updateStatus("job-001", "PARTIAL_FAILURE", {
        totalRows: 100,
        processedRows: 80,
        errorRows: 20,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("PARTIAL_FAILURE");
    });

    it("sets completedAt for terminal status FAILED", async () => {
      const failed = {
        ...mockJob,
        status: "FAILED" as const,
        completedAt: new Date(),
      };
      mockChain.returning.mockResolvedValue([failed]);

      const result = await repo.updateStatus("job-001", "FAILED");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("FAILED");
    });

    it("returns FailResult when DB update throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.updateStatus("job-001", "RUNNING");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findMany
  // -----------------------------------------------------------------------
  describe("findMany", () => {
    it("returns paginated list of jobs sorted by triggeredAt desc", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([mockJob]);
        else resolve([{ count: "1" }]);
      };

      const result = await repo.findMany({ page: 1, limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });

    it("returns empty items when no jobs exist", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([]);
        else resolve([{ count: "0" }]);
      };

      const result = await repo.findMany({ page: 1, limit: 20 });

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

      const result = await repo.findMany({ page: 1, limit: 20 });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
