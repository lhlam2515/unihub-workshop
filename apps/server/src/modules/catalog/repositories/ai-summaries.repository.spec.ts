import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { systemErrors } from "@/shared/response/errors";

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
  // findByDocumentId
  // ---------------------------------------------------------------------------
  describe("findByDocumentId", () => {
    it("returns the summary when found", async () => {
      mockChain.limit.mockResolvedValue([mockAiSummary]);

      const result = await repo.findByDocumentId("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockAiSummary);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findByDocumentId("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByDocumentId("doc-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findByWorkshopId
  // ---------------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns summaries for a workshop", async () => {
      mockChain.orderBy.mockResolvedValue([mockAiSummary]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockAiSummary]);
      }
    });

    it("returns empty array when no summaries exist", async () => {
      mockChain.orderBy.mockResolvedValue([]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.orderBy.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------
  describe("upsert", () => {
    it("inserts a new summary record with PENDING status", async () => {
      mockChain.returning.mockResolvedValue([
        {
          ...mockAiSummary,
          status: "PENDING",
          summaryId: "sum-new",
        },
      ]);

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.status).toBe("PENDING");
      }
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockChain.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.upsert("doc-001", "w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates the status only", async () => {
      const updated = { ...mockAiSummary, status: "DONE" };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("sum-001", "DONE");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("DONE");
    });

    it("updates status and summary text when provided", async () => {
      const updated = {
        ...mockAiSummary,
        status: "DONE",
        summaryText: "New summary text.",
      };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus(
        "sum-001",
        "DONE",
        "New summary text."
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("DONE");
      if (result.isSuccess) {
        expect(result.data.summaryText).toBe("New summary text.");
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.updateStatus("sum-001", "FAILED");

      expect(result.isFailure).toBe(true);
    });
  });
});
