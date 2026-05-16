import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type { PdfPipelineContext } from "./pipeline-context";
import type { IPipelineFilter } from "./pipeline-filter.interface";

/**
 * Stage 3 filter: Cleans and normalises extracted document text for LLM
 * consumption.
 *
 * Input fields read from context: `rawText`
 * Output fields written to context: `cleanedText`
 *
 * Transformations applied:
 * - Collapses multiple whitespace characters into single spaces.
 * - Normalises Windows-style line endings (CRLF) to Unix (LF).
 * - Strips non-printable characters while preserving common punctuation.
 * - Truncates to 8000 characters to stay within token limits.
 *
 * This filter is a pure function — it has no injected dependencies and
 * performs no I/O.
 */
@Injectable()
export class TextCleaningFilter implements IPipelineFilter<
  PdfPipelineContext,
  PdfPipelineContext
> {
  private readonly logger = new Logger(TextCleaningFilter.name);

  readonly name = "TextCleaning";

  /**
   * Maximum character length for text sent to the LLM.
   * Longer texts are truncated to this limit.
   */
  private readonly MAX_TEXT_LENGTH = 8000;

  async process(
    context: PdfPipelineContext
  ): Promise<Result<PdfPipelineContext>> {
    if (!context.rawText) {
      this.logger.warn("No raw text to clean — skipping cleaning stage");
      return Result.ok({ ...context, cleanedText: "" });
    }

    this.logger.log(
      `Cleaning ${context.rawText.length} characters of raw text`
    );

    const cleanedText = this.cleanAndNormalizeText(context.rawText);

    this.logger.log(
      `Text cleaned: ${cleanedText.length} characters after normalisation`
    );

    return Result.ok({ ...context, cleanedText });
  }

  /**
   * Cleans and normalises raw document text.
   *
   * Transformations:
   * 1. Collapse multiple whitespace into single space.
   * 2. Normalise CRLF to LF.
   * 3. Strip non-printable characters (keep alphanumeric, spaces, common punctuation).
   * 4. Truncate to MAX_TEXT_LENGTH characters.
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

    // Strip non-printable characters while preserving Unicode letters, digits,
    // whitespace, and common punctuation. \p{L}\p{N} covers all Unicode scripts
    // including Vietnamese diacritics — \w would only match ASCII [a-zA-Z0-9_].
    cleaned = cleaned.replace(/[^\p{L}\p{N}\s.,!?;:'"()\-–—/@$%#&*\n]/gu, "");

    // Truncate to maximum length
    if (cleaned.length > this.MAX_TEXT_LENGTH) {
      cleaned = cleaned.substring(0, this.MAX_TEXT_LENGTH);
    }

    return cleaned.trim();
  }
}
