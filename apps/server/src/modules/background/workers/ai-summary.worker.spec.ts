// Factory function prevents pdf-parse from being evaluated (jest.mock without a
// factory still loads the module to auto-mock it, which triggers pdfjs-dist →
// @napi-rs/canvas native bindings and leaves a GC handle that blocks Jest from exiting).
jest.mock("pdf-parse", () => ({ PDFParse: jest.fn() }));

import { Test } from "@nestjs/testing";

import { AiSummaryService } from "@/modules/ai-summary/services/ai-summary.service";
import { Result } from "@/shared/response/result";

import { AiSummaryWorker } from "./ai-summary.worker";

const mockAiSummaryService = {
  processDocument: jest.fn(),
  handleTimeout: jest.fn(),
};

describe("AiSummaryWorker", () => {
  let worker: AiSummaryWorker;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AiSummaryWorker,
        { provide: AiSummaryService, useValue: mockAiSummaryService },
      ],
    }).compile();

    worker = module.get(AiSummaryWorker);
  });

  describe("handle()", () => {
    const payload = {
      documentId: "doc-001",
      workshopId: "ws-001",
      fileUrl: "https://storage/file.pdf",
    };

    it("returns summary text when pipeline succeeds", async () => {
      mockAiSummaryService.processDocument.mockResolvedValue(
        Result.ok("Workshop tóm tắt nội dung.")
      );

      const result = await worker.handle(payload);

      expect(result).toBe("Workshop tóm tắt nội dung.");
      expect(mockAiSummaryService.handleTimeout).not.toHaveBeenCalled();
    });

    it("throws retryable error when pipeline fails with non-timeout code", async () => {
      mockAiSummaryService.processDocument.mockResolvedValue(
        Result.fail({
          code: "INTERNAL_ERROR" as const,
          category: "INTERNAL" as const,
          message: "Database connection lost",
        })
      );

      await expect(worker.handle(payload)).rejects.toThrow(
        "Database connection lost"
      );
      expect(mockAiSummaryService.handleTimeout).not.toHaveBeenCalled();
    });

    it("returns without retrying when pipeline FailResult has LLM_TIMEOUT code", async () => {
      mockAiSummaryService.processDocument.mockResolvedValue(
        Result.fail({
          code: "LLM_TIMEOUT" as const,
          category: "EXTERNAL" as const,
          message: "AI summarisation timed out. The document may be too long.",
        })
      );

      // Should NOT throw — LLM_TIMEOUT is a terminal failure
      const result = await worker.handle(payload);

      expect(result).toBeUndefined();
      // processDocument already called markFailed internally; no extra handleTimeout call needed
      expect(mockAiSummaryService.processDocument).toHaveBeenCalledWith(
        payload.documentId,
        payload.fileUrl,
        payload.workshopId
      );
    });

    it("calls handleTimeout and returns without retrying when withTimeout() fires", async () => {
      // processDocument would eventually resolve, but withTimeout fires first
      mockAiSummaryService.processDocument.mockResolvedValue(Result.ok("late"));
      mockAiSummaryService.handleTimeout.mockResolvedValue(Result.ok());

      // Override the worker's 40s timeout to 10ms for test speed
      const handleSpy = jest
        .spyOn(worker as any, "withTimeout")
        .mockRejectedValue(new Error("LLM_TIMEOUT"));

      const result = await worker.handle(payload);

      expect(result).toBeUndefined();
      expect(mockAiSummaryService.handleTimeout).toHaveBeenCalledWith(
        payload.documentId
      );
      handleSpy.mockRestore();
    });
  });
});
