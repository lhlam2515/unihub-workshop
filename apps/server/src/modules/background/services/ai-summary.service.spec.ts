import { Test, type TestingModule } from "@nestjs/testing";

import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";
import { Result } from "@/shared/response/result";

import { AiSummaryService } from "./ai-summary.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAiSummariesRepo = {
  upsert: jest.fn(),
  updateStatus: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("AiSummaryService", () => {
  let service: AiSummaryService;

  beforeAll(() => {
    // Mock global fetch to avoid real HTTP requests for PDF extraction
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(50)),
    });
  });

  afterAll(() => {
    // Restore original fetch if it existed
    delete (global as any).fetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        { provide: AiSummariesRepository, useValue: mockAiSummariesRepo },
      ],
    }).compile();

    service = module.get<AiSummaryService>(AiSummaryService);
  });

  // -----------------------------------------------------------------------
  // processDocument — FR-F03-002 (AI Summary pipeline)
  // -----------------------------------------------------------------------
  describe("processDocument — FR-F03-002", () => {
    it("completes the full pipeline: upsert -> extract -> clean -> LLM -> DONE", async () => {
      mockAiSummariesRepo.upsert.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "PENDING" })
      );
      mockAiSummariesRepo.updateStatus.mockResolvedValue(
        Result.ok({
          summaryId: "sum-001",
          status: "DONE",
          summaryText: "Generated summary",
        })
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toContain("AI-generated summary");
      expect(mockAiSummariesRepo.upsert).toHaveBeenCalledWith(
        "doc-001",
        "w-001"
      );
      // updateStatus called once with DONE and the summary text
      expect(mockAiSummariesRepo.updateStatus).toHaveBeenCalledWith(
        "sum-001",
        "DONE",
        expect.any(String)
      );
    });

    it("returns FailResult when upsert fails and does not call updateStatus", async () => {
      mockAiSummariesRepo.upsert.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB down" })
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockAiSummariesRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("updates status to FAILED when PDF extraction fails (fetch error)", async () => {
      // Override fetch to fail for this test
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error("Network error")
      );

      mockAiSummariesRepo.upsert.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "PENDING" })
      );
      mockAiSummariesRepo.updateStatus.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "FAILED" })
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/invalid.pdf",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(mockAiSummariesRepo.updateStatus).toHaveBeenCalledWith(
        "sum-001",
        "FAILED",
        expect.any(String)
      );
    });

    it("returns FailResult when final status update to DONE fails", async () => {
      mockAiSummariesRepo.upsert.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "PENDING" })
      );
      mockAiSummariesRepo.updateStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR", message: "DB update failed" })
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
