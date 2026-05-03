import { Injectable, Logger } from "@nestjs/common";

import { aiSummaryErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";
import { StorageService } from "@/shared/storage/storage.service";

import type { PdfPipelineContext } from "./pipeline-context";
import type { IPipelineFilter } from "./pipeline-filter.interface";

/**
 * Stage 2 filter: Downloads a PDF from object storage and extracts its text
 * content using pdf-parse.
 *
 * Input fields read from context: `fileUrl`
 * Output fields written to context: `rawText`
 *
 * Business rules:
 * - Accepts the PDF's public R2 URL as the input file reference.
 * - Delegates the HTTP download to StorageService.getFileBuffer().
 * - Feeds the raw Buffer directly into pdf-parse (optimised for Buffer input).
 * - Returns FAILED status for corrupt PDFs or network errors.
 *
 * Side effects:
 * - Opens a network connection to the S3-compatible object store.
 */
@Injectable()
export class PdfExtractionFilter implements IPipelineFilter<
  PdfPipelineContext,
  PdfPipelineContext
> {
  private readonly logger = new Logger(PdfExtractionFilter.name);

  readonly name = "PdfExtraction";

  constructor(private readonly storageService: StorageService) {}

  async process(
    context: PdfPipelineContext
  ): Promise<Result<PdfPipelineContext>> {
    this.logger.log(`Extracting text from PDF: ${context.fileUrl}`);

    // Download the PDF buffer via StorageService
    const bufferResult = await this.storageService.getFileBuffer(
      context.fileUrl
    );
    if (bufferResult.isFailure) {
      this.logger.warn(`Failed to download PDF: ${bufferResult.error.message}`);
      return Result.fail(
        aiSummaryErrors.pdfExtractionFailed(bufferResult.error)
      );
    }

    // Extract text via pdf-parse
    const extractResult = await tryCatch(
      async () => {
        const { PDFParse } = await import("pdf-parse");
        const pdf = new PDFParse({ data: bufferResult.data });
        try {
          const result = await pdf.getText();
          return result.text;
        } finally {
          pdf.destroy();
        }
      },
      (err) => aiSummaryErrors.pdfExtractionFailed(err)
    );

    if (extractResult.isFailure) {
      this.logger.warn(`Failed to parse PDF: ${extractResult.error.message}`);
      return Result.fail(extractResult.error);
    }

    this.logger.log(
      `Extracted ${extractResult.data.length} characters from PDF`
    );

    return Result.ok({
      ...context,
      rawText: extractResult.data,
    });
  }
}
