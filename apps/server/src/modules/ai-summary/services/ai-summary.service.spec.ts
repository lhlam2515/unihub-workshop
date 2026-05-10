import { Test, type TestingModule } from "@nestjs/testing";

import { StorageService } from "@/infra/storage/storage.service";
import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { WorkshopsRepository } from "@/modules/catalog/repositories/workshops.repository";
import { Result } from "@/shared/response/result";

import { AiSummaryService } from "./ai-summary.service";
import { PdfSummaryPipeline } from "../pipeline/pdf-summary.pipeline";

import type { PdfPipelineContext } from "../pipeline/pipeline-context";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPdfSummaryPipeline = {
  execute: jest.fn(),
};

const mockAiSummariesRepo = {
  upsert: jest.fn(),
  updateStatus: jest.fn(),
  findByDocumentId: jest.fn(),
};

const mockStorageService = {
  uploadFile: jest.fn(),
};

const mockWorkshopsRepo = {
  findById: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  overrides?: Partial<PdfPipelineContext>
): PdfPipelineContext {
  return {
    documentId: "doc-001",
    workshopId: "w-001",
    fileUrl: "https://storage.example.com/doc-001.pdf",
    summaryId: "sum-001",
    rawText: "Raw extracted text from PDF",
    cleanedText: "Cleaned text ready for LLM",
    summaryText: overrides?.summaryText ?? "Generated summary",
    modelUsed: "deepseek-v4-pro",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("AiSummaryService", () => {
  let service: AiSummaryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        { provide: PdfSummaryPipeline, useValue: mockPdfSummaryPipeline },
        { provide: AiSummariesRepository, useValue: mockAiSummariesRepo },
        { provide: StorageService, useValue: mockStorageService },
        { provide: WorkshopsRepository, useValue: mockWorkshopsRepo },
      ],
    }).compile();

    service = module.get<AiSummaryService>(AiSummaryService);
  });

  // -----------------------------------------------------------------------
  // processDocument — delegates to PdfSummaryPipeline
  // -----------------------------------------------------------------------
  describe("processDocument", () => {
    it("completes the full pipeline: pipeline.execute -> DONE", async () => {
      mockPdfSummaryPipeline.execute.mockResolvedValue(
        Result.ok(makeContext({ summaryText: "Generated summary" }))
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe("Generated summary");
      expect(mockPdfSummaryPipeline.execute).toHaveBeenCalledWith(
        "doc-001",
        "w-001",
        "https://storage.example.com/doc-001.pdf"
      );
    });

    it("returns FailResult when pipeline fails and marks summary FAILED", async () => {
      mockPdfSummaryPipeline.execute.mockResolvedValue(
        Result.fail({
          code: "PDF_EXTRACTION_FAILED",
          category: "EXTERNAL",
          message: "PDF corrupt",
        })
      );
      mockAiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.ok({ summaryId: "sum-001" })
      );
      mockAiSummariesRepo.updateStatus.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "FAILED" })
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("PDF_EXTRACTION_FAILED");
      // Should attempt to mark the record as FAILED
      expect(mockAiSummariesRepo.findByDocumentId).toHaveBeenCalledWith(
        "doc-001"
      );
      expect(mockAiSummariesRepo.updateStatus).toHaveBeenCalledWith(
        "sum-001",
        "FAILED",
        expect.any(String)
      );
    });

    it("returns FailResult when pipeline errors but no summary record exists (graceful)", async () => {
      mockPdfSummaryPipeline.execute.mockResolvedValue(
        Result.fail({
          code: "INTERNAL_ERROR",
          category: "INTERNAL",
          message: "DB down",
        })
      );
      mockAiSummariesRepo.findByDocumentId.mockResolvedValue(Result.ok(null));

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
      // Should not crash when no record exists — gracefully handles it
      expect(mockAiSummariesRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("handles pipeline returning empty summary text", async () => {
      mockPdfSummaryPipeline.execute.mockResolvedValue(
        Result.ok(makeContext({ summaryText: "" }))
      );

      const result = await service.processDocument(
        "doc-001",
        "https://storage.example.com/doc-001.pdf",
        "w-001"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // handleTimeout
  // -----------------------------------------------------------------------
  describe("handleTimeout", () => {
    it("marks the summary as FAILED with LLM_TIMEOUT", async () => {
      mockAiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.ok({ summaryId: "sum-001" })
      );
      mockAiSummariesRepo.updateStatus.mockResolvedValue(
        Result.ok({ summaryId: "sum-001", status: "FAILED" })
      );

      const result = await service.handleTimeout("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(mockAiSummariesRepo.findByDocumentId).toHaveBeenCalledWith(
        "doc-001"
      );
      expect(mockAiSummariesRepo.updateStatus).toHaveBeenCalledWith(
        "sum-001",
        "FAILED",
        "LLM_TIMEOUT"
      );
    });

    it("gracefully handles missing summary record on timeout", async () => {
      mockAiSummariesRepo.findByDocumentId.mockResolvedValue(Result.ok(null));

      const result = await service.handleTimeout("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(mockAiSummariesRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
