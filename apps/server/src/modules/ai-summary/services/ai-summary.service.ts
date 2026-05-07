import { Injectable, Logger } from "@nestjs/common";

import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { Result } from "@/shared/response/result";

import { PdfSummaryPipeline } from "../pipeline/pdf-summary.pipeline";

/**
 * AiSummaryService
 *
 * Orchestrates the AI-powered document summarization pipeline.
 * Delegates all processing stages to the PdfSummaryPipeline (Pipe-and-Filter),
 * and handles failure-side effects (marking DB records as FAILED).
 *
 * Business rules:
 * - Each documentId maps to exactly one ai_summaries row (enforced by unique constraint).
 * - Pipeline failure marks the summary status as FAILED with the error message.
 *
 * Side effects:
 * - Delegates to PdfSummaryPipeline which upserts, extracts, cleans, summarises,
 *   and persists the result.
 * - On failure or timeout, updates ai_summaries status to FAILED.
 *
 * This service is consumed by AiSummaryWorker for each queued document job.
 */
@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly pipeline: PdfSummaryPipeline,
    private readonly aiSummariesRepo: AiSummariesRepository
  ) {}

  /**
   * Runs the full document summarization pipeline.
   *
   * Pipeline stages (delegated to PdfSummaryPipeline):
   * 1. Upsert the ai_summaries record (creates new or resets existing to PENDING).
   * 2. Extract raw text from the PDF located at the storage URL.
   * 3. Clean and normalise the extracted text (whitespace, newlines, truncation).
   * 4. Call the DeepSeek API (via Anthropic SDK) to generate a summary.
   * 5. Persist the result with status DONE.
   *
   * On failure at any stage, marks the DB record as FAILED with the error.
   *
   * @param documentId - The UUID of the workshop document to summarise.
   * @param fileUrl - The object-storage URL of the PDF file.
   * @param workshopId - The UUID of the associated workshop.
   * @returns OkResult with the generated summary text, or FailResult (INTERNAL_ERROR).
   */
  async processDocument(
    documentId: string,
    fileUrl: string,
    workshopId: string
  ): Promise<Result<string>> {
    this.logger.log(
      `Processing document ${documentId} for workshop ${workshopId}`
    );

    const result = await this.pipeline.execute(documentId, workshopId, fileUrl);

    if (result.isFailure) {
      this.logger.warn(
        `Pipeline failed for document ${documentId}: ${result.error.message}`,
        { error: result.error.code }
      );

      // Mark as FAILED in the database — needed when failure happens
      // before the PersistResultFilter would have been reached.
      await this.markFailed(documentId, result.error.message);

      return Result.fail(result.error);
    }

    const summaryText = result.data.summaryText ?? "";
    this.logger.log(`Summary completed for document ${documentId}`);
    return Result.ok(summaryText);
  }

  /**
   * Marks a document's summary as FAILED due to any pipeline error.
   *
   * This is called when the pipeline fails before reaching the persist stage,
   * or when the worker detects an LLM timeout.
   *
   * @param documentId - The UUID of the document whose summary failed.
   * @param errorMessage - The error message to record.
   */
  private async markFailed(
    documentId: string,
    errorMessage: string
  ): Promise<void> {
    const summaryResult =
      await this.aiSummariesRepo.findByDocumentId(documentId);

    if (summaryResult.isFailure || !summaryResult.data) {
      this.logger.error(
        `No summary record found to mark FAILED for document ${documentId}`
      );
      return;
    }

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "FAILED",
      errorMessage
    );

    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to mark summary FAILED for document ${documentId}: ${updateResult.error.message}`
      );
    }
  }

  /**
   * Marks a document's summary as FAILED due to LLM timeout.
   *
   * Called by AiSummaryWorker when the 40s Promise.race timeout fires.
   *
   * @param documentId - The UUID of the document whose summary timed out.
   */
  async handleTimeout(documentId: string): Promise<Result<void>> {
    this.logger.warn(
      `LLM timeout for document ${documentId}, marking as FAILED`
    );

    await this.markFailed(documentId, "LLM_TIMEOUT");
    return Result.ok();
  }
}
