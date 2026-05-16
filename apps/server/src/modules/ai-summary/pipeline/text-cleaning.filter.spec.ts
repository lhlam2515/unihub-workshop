import { TextCleaningFilter } from "./text-cleaning.filter";

import type { PdfPipelineContext } from "./pipeline-context";

describe("TextCleaningFilter", () => {
  let filter: TextCleaningFilter;

  beforeEach(() => {
    filter = new TextCleaningFilter();
  });

  describe("process()", () => {
    it("returns empty cleanedText when rawText is absent", async () => {
      const ctx: PdfPipelineContext = {
        documentId: "doc-1",
        workshopId: "ws-1",
        fileUrl: "https://storage/file.pdf",
      };

      const result = await filter.process(ctx);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.cleanedText).toBe("");
    });

    it("collapses multiple whitespace into single space", async () => {
      const ctx: PdfPipelineContext = {
        documentId: "doc-1",
        workshopId: "ws-1",
        fileUrl: "https://storage/file.pdf",
        rawText: "hello   world\t\ttab",
      };

      const result = await filter.process(ctx);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.cleanedText).toBe("hello world tab");
    });

    it("preserves Vietnamese diacritical characters", async () => {
      const ctx: PdfPipelineContext = {
        documentId: "doc-1",
        workshopId: "ws-1",
        fileUrl: "https://storage/file.pdf",
        rawText:
          "Đây là workshop về lập trình TypeScript với NestJS và các kỹ thuật xây dựng API hiện đại.",
      };

      const result = await filter.process(ctx);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.cleanedText).toContain("Đây");
      expect(result.data?.cleanedText).toContain("là");
      expect(result.data?.cleanedText).toContain("lập trình");
      expect(result.data?.cleanedText).toContain("kỹ thuật");
      expect(result.data?.cleanedText).toContain("xây dựng");
      expect(result.data?.cleanedText).toContain("hiện đại");
    });

    it("strips non-printable control characters while keeping punctuation", async () => {
      const ctx: PdfPipelineContext = {
        documentId: "doc-1",
        workshopId: "ws-1",
        fileUrl: "https://storage/file.pdf",
        rawText: "Hello,\x00\x01 world! Code: 100%",
      };

      const result = await filter.process(ctx);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.cleanedText).toBe("Hello, world! Code: 100%");
    });

    it("truncates text exceeding 8000 characters", async () => {
      const longText = "a".repeat(10_000);
      const ctx: PdfPipelineContext = {
        documentId: "doc-1",
        workshopId: "ws-1",
        fileUrl: "https://storage/file.pdf",
        rawText: longText,
      };

      const result = await filter.process(ctx);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.cleanedText?.length).toBeLessThanOrEqual(8000);
    });
  });
});
