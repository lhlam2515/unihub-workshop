import { Injectable, Logger } from "@nestjs/common";

import { chainAsync, Result } from "@/shared/response/result";

import { LlmSummaryFilter } from "./llm-summary.filter";
import { PdfExtractionFilter } from "./pdf-extraction.filter";
import { PersistResultFilter } from "./persist-result.filter";
import { createPipelineContext } from "./pipeline-context";
import { TextCleaningFilter } from "./text-cleaning.filter";
import { UpsertRecordFilter } from "./upsert-record.filter";

import type { PdfPipelineContext } from "./pipeline-context";

/**
 * PdfSummaryPipeline
 *
 * Composes the five independent filters of the AI summary pipeline into a
 * sequential processing chain using the Pipe-and-Filter architecture.
 *
 * Pipeline stages:
 *   1. UpsertRecordFilter  — upserts a QUEUED ai_summaries record
 *   2. PdfExtractionFilter — downloads PDF and extracts raw text via pdf-parse
 *   3. TextCleaningFilter  — normalises whitespace, strips noise, truncates
 *   4. LlmSummaryFilter    — calls DeepSeek API via Anthropic SDK
 *   5. PersistResultFilter — saves the DONE/FAILED status to the database
 *
 * Each filter receives the shared PdfPipelineContext, reads the fields it
 * needs, and writes its output fields back. Filters never know about each
 * other — they only know the context shape.
 *
 * On failure at any stage, the pipeline short-circuits: filters after the
 * failing one are not executed. The caller (AiSummaryService) is responsible
 * for marking the DB record as FAILED.
 *
 * Business rules:
 * - Uses chainAsync for functional pipe composition (short-circuits on failure).
 * - Filters are ordered by dependency: each filter's input is produced by
 *   the previous filter's output.
 * - The pipeline is stateless — all state lives in PdfPipelineContext.
 */
@Injectable()
export class PdfSummaryPipeline {
  private readonly logger = new Logger(PdfSummaryPipeline.name);

  constructor(
    private readonly upsertFilter: UpsertRecordFilter,
    private readonly extractFilter: PdfExtractionFilter,
    private readonly cleanFilter: TextCleaningFilter,
    private readonly llmFilter: LlmSummaryFilter,
    private readonly persistFilter: PersistResultFilter
  ) {}

  /**
   * Runs the full AI summary pipeline for a document.
   *
   * Each filter transforms the context in sequence. If any filter returns
   * a FailResult, the remaining filters are skipped and the error propagates
   * to the caller.
   *
   * @param documentId - UUID of the workshop document to summarise.
   * @param workshopId - UUID of the associated workshop.
   * @param fileUrl - Object-storage URL of the PDF file.
   * @returns OkResult containing the final context (with summaryText populated),
   *          or FailResult with the error from the first failing filter.
   */
  async execute(
    documentId: string,
    workshopId: string,
    fileUrl: string
  ): Promise<Result<PdfPipelineContext>> {
    const ctx = createPipelineContext(documentId, workshopId, fileUrl);

    this.logger.log(`Starting AI summary pipeline for document ${documentId}`);

    // Compose the five filters as a functional pipe chain.
    // Each chainAsync call passes the context through the next filter,
    // short-circuiting on the first failure — true Pipe-and-Filter semantics.
    const result = await chainAsync(
      this.upsertFilter.process(ctx),
      (updatedCtx) => this.extractFilter.process(updatedCtx)
    );

    const result2 = await chainAsync(result, (updatedCtx) =>
      this.cleanFilter.process(updatedCtx)
    );

    const result3 = await chainAsync(result2, (updatedCtx) =>
      this.llmFilter.process(updatedCtx)
    );

    const result4 = await chainAsync(result3, (updatedCtx) =>
      this.persistFilter.process(updatedCtx)
    );

    if (result4.isFailure) {
      this.logger.warn(
        `Pipeline failed for document ${documentId}: ${result4.error.message}`
      );
      return result4;
    }

    this.logger.log(`Pipeline completed for document ${documentId}`);
    return result4;
  }
}
