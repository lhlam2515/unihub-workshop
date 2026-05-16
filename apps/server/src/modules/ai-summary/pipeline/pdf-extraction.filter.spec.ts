import { PDFParse } from "pdf-parse";

import { StorageService } from "@/infra/storage/storage.service";
import { Result } from "@/shared/response/result";

import { PdfExtractionFilter } from "./pdf-extraction.filter";

import type { PdfPipelineContext } from "./pipeline-context";

// Factory prevents pdf-parse from being evaluated; avoids @napi-rs/canvas native GC handle.
jest.mock("pdf-parse", () => ({ PDFParse: jest.fn() }));

const MockedPDFParse = PDFParse as jest.MockedClass<typeof PDFParse>;

const mockGetFileBuffer = jest.fn();
const mockStorage = {
  getFileBuffer: mockGetFileBuffer,
} as unknown as StorageService;

const CONTEXT: PdfPipelineContext = {
  documentId: "doc-001",
  workshopId: "ws-001",
  fileUrl: "https://r2.example.com/workshop.pdf",
};

describe("PdfExtractionFilter", () => {
  let filter: PdfExtractionFilter;
  let mockPdf: { getText: jest.Mock; destroy: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPdf = {
      getText: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    MockedPDFParse.mockImplementation(() => mockPdf as any);
    filter = new PdfExtractionFilter(mockStorage);
  });

  // ── Happy path ────────────────────────────────────────────────────

  it("extracts raw text from PDF buffer and writes to context.rawText", async () => {
    const buffer = Buffer.from("fake-pdf-bytes");
    mockGetFileBuffer.mockResolvedValue(Result.ok(buffer));
    mockPdf.getText.mockResolvedValue({ text: "Workshop content here." });

    const result = await filter.process(CONTEXT);

    expect(result.isSuccess).toBe(true);
    expect(result.data?.rawText).toBe("Workshop content here.");
  });

  it("passes the downloaded buffer as data to PDFParse constructor", async () => {
    const buffer = Buffer.from("fake-pdf-bytes");
    mockGetFileBuffer.mockResolvedValue(Result.ok(buffer));
    mockPdf.getText.mockResolvedValue({ text: "content" });

    await filter.process(CONTEXT);

    expect(MockedPDFParse).toHaveBeenCalledWith({ data: buffer });
  });

  // ── Failure cases ─────────────────────────────────────────────────

  it("returns PDF_EXTRACTION_FAILED when storage download fails", async () => {
    mockGetFileBuffer.mockResolvedValue(
      Result.fail({
        code: "INTERNAL_ERROR" as const,
        category: "INTERNAL" as const,
        message: "S3 connection error",
      })
    );

    const result = await filter.process(CONTEXT);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("PDF_EXTRACTION_FAILED");
  });

  it("returns PDF_EXTRACTION_FAILED when pdf.getText() throws", async () => {
    mockGetFileBuffer.mockResolvedValue(
      Result.ok(Buffer.from("malformed-pdf"))
    );
    mockPdf.getText.mockRejectedValue(new Error("Invalid PDF structure"));

    const result = await filter.process(CONTEXT);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("PDF_EXTRACTION_FAILED");
  });

  // ── Resource cleanup ──────────────────────────────────────────────

  it("calls pdf.destroy() after successful extraction", async () => {
    mockGetFileBuffer.mockResolvedValue(Result.ok(Buffer.from("pdf")));
    mockPdf.getText.mockResolvedValue({ text: "content" });

    await filter.process(CONTEXT);

    expect(mockPdf.destroy).toHaveBeenCalledTimes(1);
  });

  it("calls pdf.destroy() even when getText() fails", async () => {
    mockGetFileBuffer.mockResolvedValue(Result.ok(Buffer.from("bad-pdf")));
    mockPdf.getText.mockRejectedValue(new Error("parse error"));

    await filter.process(CONTEXT);

    expect(mockPdf.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not propagate destroy() rejection when extraction succeeded", async () => {
    mockGetFileBuffer.mockResolvedValue(Result.ok(Buffer.from("pdf")));
    mockPdf.getText.mockResolvedValue({ text: "extracted content" });
    mockPdf.destroy.mockRejectedValue(
      new Error("worker thread cleanup failed")
    );

    const result = await filter.process(CONTEXT);

    expect(result.isSuccess).toBe(true);
    expect(result.data?.rawText).toBe("extracted content");
  });
});
