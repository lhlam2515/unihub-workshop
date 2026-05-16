import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";

import { AiSummariesRepository } from "./ai-summaries.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAiSummary = {
  summaryId: "sum-001",
  documentId: "doc-001",
  workshopId: "w-001",
  status: "DONE",
  summaryText: "This is an AI-generated summary.",
  modelUsed: "gpt-4",
  generatedAt: new Date("2026-05-01T00:00:00Z"),
  errorMessage: null,
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
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
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

describe("AiSummariesRepository", () => {
  let repo: AiSummariesRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      aiSummaries: {
        summaryId: "summaryId",
        documentId: "documentId",
        workshopId: "workshopId",
        status: "status",
      },
    };

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

  // ---------------------------------------------------------------------------
  // findByWorkshopId
  // ---------------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns the summary when found", async () => {
      mockChain.limit.mockResolvedValue([mockAiSummary]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockAiSummary);
      expect(mockDb.select).toHaveBeenCalled();
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
  // upsert
  // ---------------------------------------------------------------------------
  describe("upsert", () => {
    it("inserts a new summary record when none exists", async () => {
      mockChain.limit.mockResolvedValue([]);
      mockChain.returning.mockResolvedValue([mockAiSummary]);

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isSuccess).toBe(true);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("updates existing summary status when one exists", async () => {
      mockChain.limit.mockResolvedValue([mockAiSummary]);
      mockChain.returning.mockResolvedValue([
        { ...mockAiSummary, status: "QUEUED" },
      ]);

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("QUEUED");
      }
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("updates both status and documentId when re-uploading", async () => {
      const existingRecord = { ...mockAiSummary, documentId: "doc-old" };
      mockChain.limit.mockResolvedValue([existingRecord]);
      const newDocumentId = "doc-new";
      mockChain.returning.mockResolvedValue([
        {
          ...existingRecord,
          documentId: newDocumentId,
          status: "QUEUED",
        },
      ]);

      const result = await repo.upsert(newDocumentId, "w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("QUEUED");
        expect(result.data.documentId).toBe(newDocumentId);
      }
      // Verify the .set() was called with both status and documentId
      expect(mockChain.set).toHaveBeenCalledWith({
        status: "QUEUED",
        documentId: newDocumentId,
      });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------
  describe("updateStatus", () => {
    it("clears stale errorMessage when transitioning to QUEUED", async () => {
      const updated = {
        ...mockAiSummary,
        status: "QUEUED",
        errorMessage: null,
      };
      mockChain.returning.mockResolvedValue([updated]);

      await repo.updateStatus("sum-001", "QUEUED");

      const setArg = mockChain.set.mock.calls[0][0];
      expect(setArg.status).toBe("QUEUED");
      // Stale errorMessage from a previous failure must be wiped on retry
      expect(setArg.errorMessage).toBeNull();
      // QUEUED must NOT set generatedAt or summaryText
      expect(setArg.generatedAt).toBeUndefined();
      expect(setArg.summaryText).toBeUndefined();
    });

    it("sets summaryText and generatedAt when status is DONE", async () => {
      const updated = {
        ...mockAiSummary,
        status: "DONE",
        summaryText: "New summary text.",
        generatedAt: new Date(),
      };
      mockChain.returning.mockResolvedValue([updated]);

      const before = new Date();
      const result = await repo.updateStatus("sum-001", "DONE", {
        summaryText: "New summary text.",
      });
      const after = new Date();

      expect(result.isSuccess).toBe(true);
      expect(result.data.summaryText).toBe("New summary text.");

      const setArg = mockChain.set.mock.calls[0][0];
      expect(setArg.generatedAt).toBeInstanceOf(Date);
      expect(setArg.generatedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(setArg.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      // DONE must clear stale errorMessage from a prior failure
      expect(setArg.errorMessage).toBeNull();
    });

    it("clears stale errorMessage when transitioning to DONE", async () => {
      mockChain.returning.mockResolvedValue([mockAiSummary]);

      await repo.updateStatus("sum-001", "DONE", { summaryText: "text" });

      const setArg = mockChain.set.mock.calls[0][0];
      expect(setArg.errorMessage).toBeNull();
    });

    it("persists rawText and modelUsed when status is DONE", async () => {
      mockChain.returning.mockResolvedValue([mockAiSummary]);

      await repo.updateStatus("sum-001", "DONE", {
        summaryText: "summary",
        rawText: "raw extracted content",
        modelUsed: "deepseek-v4-pro",
      });

      expect(mockChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          rawText: "raw extracted content",
          modelUsed: "deepseek-v4-pro",
        })
      );
    });

    it("routes errorMessage to error_message column when status is FAILED", async () => {
      const updated = {
        ...mockAiSummary,
        status: "FAILED",
        errorMessage: "AI summarisation timed out.",
      };
      mockChain.returning.mockResolvedValue([updated]);

      await repo.updateStatus("sum-001", "FAILED", {
        errorMessage: "AI summarisation timed out.",
      });

      const setArg = mockChain.set.mock.calls[0][0];
      expect(setArg.errorMessage).toBe("AI summarisation timed out.");
      // FAILED must NOT write to summaryText or generatedAt
      expect(setArg.summaryText).toBeUndefined();
      expect(setArg.generatedAt).toBeUndefined();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.updateStatus("sum-001", "FAILED");

      expect(result.isFailure).toBe(true);
    });
  });
});
