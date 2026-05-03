import { Injectable, Logger } from "@nestjs/common";

import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

/**
 * AiSummaryService
 *
 * Orchestrates the AI-powered document summarization pipeline.
 * Processes a single document through five stages:
 * upsert record → extract PDF text → clean text → call LLM → save result.
 *
 * Business rules:
 * - Each documentId maps to exactly one ai_summaries row (enforced by unique constraint).
 * - Processing status resets to PENDING on each attempt via upsert.
 * - Failed extractions and LLM calls update the summary status to FAILED.
 *
 * Side effects:
 * - Upserts ai_summaries row on each run.
 * - Fetches the PDF from the storage URL via HTTP.
 * - Updates ai_summaries.status to DONE or FAILED.
 *
 * This service is consumed by AiSummaryWorker for each queued document job.
 */
@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(private readonly aiSummariesRepo: AiSummariesRepository) {}

  /**
   * Runs the full document summarization pipeline.
   *
   * Pipeline stages:
   * 1. Upsert the ai_summaries record (creates new or resets existing to PENDING).
   * 2. Extract raw text from the PDF located at the storage URL.
   * 3. Clean and normalise the extracted text (whitespace, newlines, truncation).
   * 4. Call the Claude API to generate a summary.
   * 5. Persist the result with status DONE (or FAILED if any stage fails).
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

    // Stage 1: Upsert summary record (create or reset to PENDING)
    const upsertResult = await this.aiSummariesRepo.upsert(
      documentId,
      workshopId
    );
    if (upsertResult.isFailure) {
      this.logger.error(`Failed to upsert summary for document ${documentId}`, {
        error: upsertResult.error.code,
      });
      return Result.fail(upsertResult.error);
    }

    const summaryId = upsertResult.data.summaryId;

    // Stage 2: Extract text from PDF via storage URL
    const extractResult = await this.extractTextFromPdf(fileUrl);
    if (extractResult.isFailure) {
      this.logger.warn(`PDF extraction failed for document ${documentId}`, {
        error: extractResult.error.message,
      });
      await this.aiSummariesRepo.updateStatus(
        summaryId,
        "FAILED",
        extractResult.error.message
      );
      return Result.fail(extractResult.error);
    }

    const rawText = extractResult.data;

    // Stage 3: Clean and normalise extracted text
    const cleanedText = this.cleanAndNormalizeText(rawText);

    // Stage 4: Call Claude API for summarisation
    const llmResult = await this.callClaudeApi(cleanedText);
    if (llmResult.isFailure) {
      this.logger.warn(`LLM call failed for document ${documentId}`, {
        error: llmResult.error.message,
      });
      await this.aiSummariesRepo.updateStatus(
        summaryId,
        "FAILED",
        llmResult.error.message
      );
      return Result.fail(llmResult.error);
    }

    const summaryText = llmResult.data;

    // Stage 5: Persist successful result
    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryId,
      "DONE",
      summaryText
    );
    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to persist summary result for document ${documentId}`,
        { error: updateResult.error.code }
      );
      return Result.fail(updateResult.error);
    }

    this.logger.log(`Summary completed for document ${documentId}`);
    return Result.ok(summaryText);
  }

  /**
   * Fetches a PDF from the object-storage URL and extracts its text content.
   *
   * Currently returns a placeholder string. The real implementation should use
   * a PDF parsing library such as `pdf-parse` (Node.js) or `pdfjs-dist`.
   *
   * TODO: Replace placeholder with real pdf-parse integration.
   *
   * @param pdfUrl - The object-storage URL of the PDF to extract.
   * @returns OkResult with the extracted text, or FailResult (INTERNAL_ERROR).
   */
  private async extractTextFromPdf(pdfUrl: string): Promise<Result<string>> {
    return tryCatch(
      async () => {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch PDF: ${response.status} ${response.statusText}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();

        // TODO: Replace with real pdf-parse implementation:
        //   import pdf from 'pdf-parse';
        //   const buffer = Buffer.from(arrayBuffer);
        //   const data = await pdf(buffer);
        //   return data.text;

        return `[Extracted text from PDF — ${arrayBuffer.byteLength} bytes]`;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Cleans and normalises extracted document text for LLM consumption.
   *
   * Transformations applied:
   * - Collapses multiple whitespace characters into single spaces.
   * - Normalises Windows-style line endings (CRLF) to Unix (LF).
   * - Strips non-printable characters while preserving common punctuation.
   * - Truncates to 8000 characters to stay within token limits.
   *
   * @param text - The raw extracted text to clean.
   * @returns The cleaned and truncated text.
   */
  private cleanAndNormalizeText(text: string): string {
    let cleaned = text;

    // Collapse multiple whitespace characters into single space
    cleaned = cleaned.replace(/\s+/g, " ");

    // Normalise Windows-style line endings
    cleaned = cleaned.replace(/\r\n/g, "\n");

    // Strip non-printable characters (preserve alphanumeric, spaces, common punctuation)
    cleaned = cleaned.replace(/[^\w\s.,!?;:'"()\-–—/@$%#&*\n]/g, "");

    // Truncate to 8000 characters to fit within token limits
    const MAX_LENGTH = 8000;
    if (cleaned.length > MAX_LENGTH) {
      cleaned = cleaned.substring(0, MAX_LENGTH);
    }

    return cleaned.trim();
  }

  /**
   * Calls the Claude API to generate a summary of the cleaned document text.
   *
   * Currently returns a placeholder summary string. The real implementation
   * should use the Anthropic SDK (`@anthropic-ai/sdk`) with the
   * `claude-sonnet-4-20250514` model and a summarisation system prompt.
   *
   * TODO: Replace placeholder with real Anthropic SDK integration.
   *
   * @param text - The cleaned document text to summarise.
   * @returns OkResult with the generated summary, or FailResult (INTERNAL_ERROR).
   */
  private async callClaudeApi(text: string): Promise<Result<string>> {
    return tryCatch(
      async () => {
        // TODO: Replace with real Anthropic SDK integration:
        //   import Anthropic from '@anthropic-ai/sdk';
        //   const anthropic = new Anthropic({
        //     apiKey: process.env.ANTHROPIC_API_KEY,
        //   });
        //   const message = await anthropic.messages.create({
        //     model: 'claude-sonnet-4-20250514',
        //     max_tokens: 1024,
        //     messages: [
        //       {
        //         role: 'user',
        //         content: `Please summarise the following workshop document:\n\n${text}`,
        //       },
        //     ],
        //   });
        //   return message.content[0].text;

        return `AI-generated summary of document. Text length: ${text.length} characters.`;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Marks a document's summary as FAILED due to LLM timeout.
   *
   * @param documentId - The UUID of the document whose summary timed out.
   */
  async handleTimeout(documentId: string): Promise<Result<void>> {
    this.logger.warn(
      `LLM timeout for document ${documentId}, marking as FAILED`
    );

    const summaryResult =
      await this.aiSummariesRepo.findByDocumentId(documentId);
    if (summaryResult.isFailure || !summaryResult.data) {
      this.logger.error(
        `No summary record found for timed-out document ${documentId}`
      );
      return Result.ok();
    }

    const updateResult = await this.aiSummariesRepo.updateStatus(
      summaryResult.data.summaryId,
      "FAILED",
      "LLM_TIMEOUT"
    );
    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to mark summary FAILED for document ${documentId}`
      );
    }

    return Result.ok();
  }
}
