import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };

  const db: any = {
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
    select: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

const mockAiSummary = {
  summaryId: "sum-001",
  documentId: "doc-001",
  workshopId: "w-001",
  status: "PENDING",
  summaryText: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const mockSchema: any = {
  aiSummaries: {
    summaryId: "summaryId",
    documentId: "documentId",
    workshopId: "workshopId",
    status: "status",
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("AiSummariesRepository (background)", () => {
  let repo: AiSummariesRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSummariesRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<AiSummariesRepository>(AiSummariesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // findByDocumentId
  // -----------------------------------------------------------------------
  describe("findByDocumentId", () => {
    it("returns the summary when found", async () => {
      mockChain.limit.mockResolvedValue([mockAiSummary]);

      const result = await repo.findByDocumentId("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockAiSummary);
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findByDocumentId("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB down"));

      const result = await repo.findByDocumentId("doc-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByWorkshopId — chain ends with .where() which returns chainable,
  // so we make chainable thenable to control the awaited result
  // -----------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns all summaries for a workshop", async () => {
      mockChain.then = (resolve: any) => resolve([mockAiSummary]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].summaryId).toBe("sum-001");
    });

    it("returns empty array when workshop has no summaries", async () => {
      mockChain.then = (resolve: any) => resolve([]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.then = (_resolve: any, reject: any) =>
        reject(new Error("DB down"));

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // upsert
  // -----------------------------------------------------------------------
  describe("upsert", () => {
    it("inserts or resets a summary record to PENDING", async () => {
      const inserted = { ...mockAiSummary, status: "PENDING" };
      mockChain.returning.mockResolvedValue([inserted]);

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("PENDING");
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.aiSummaries);
      expect(mockChain.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates status to DONE with summary text", async () => {
      const done = {
        ...mockAiSummary,
        status: "DONE",
        summaryText: "Generated summary text",
      };
      mockChain.returning.mockResolvedValue([done]);

      const result = await repo.updateStatus(
        "sum-001",
        "DONE",
        "Generated summary text"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("DONE");
      expect(result.data.summaryText).toBe("Generated summary text");
    });

    it("updates status to FAILED without summary text", async () => {
      const failed = { ...mockAiSummary, status: "FAILED" };
      mockChain.returning.mockResolvedValue([failed]);

      const result = await repo.updateStatus("sum-001", "FAILED");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("FAILED");
    });

    it("returns FailResult when DB update throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.updateStatus("sum-001", "DONE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
