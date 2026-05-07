/**
 * AI Summary Response DTOs
 *
 * Two shapes:
 * - AiSummaryPublicDto: { status, summary_text, model_used, generated_at }
 * - AiSummaryAdminDto: extends with summary_id, document_id, error_message
 */

import type { AiSummary } from "@/infra/database/types/async.types";

export interface AiSummaryPublicDto {
  status: string;
  summary_text?: string;
  model_used?: string;
  generated_at?: Date;
}

export interface AiSummaryAdminDto extends AiSummaryPublicDto {
  summary_id: string;
  document_id: string;
  error_message?: string;
}

export class AiSummaryResponseBuilder {
  /**
   * Builds a public AI summary DTO with conditional field exposure.
   *
   * Business rules:
   * - summary_text is only included when status === 'DONE' to avoid exposing
   *   partial or failed content to public users. Other statuses omit the field entirely.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - summaryText -> summary_text (only when status === 'DONE')
   * - modelUsed -> model_used
   * - generatedAt -> generated_at
   * - Nullish optional fields -> undefined (omitted in JSON serialization)
   *
   * Internal fields excluded:
   * - summaryId, documentId, errorMessage — not exposed to public users
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryPublicDto with consumer-safe fields.
   */
  static fromPublic(summary: AiSummary): AiSummaryPublicDto {
    return {
      status: summary.status,
      ...(summary.status === "DONE"
        ? { summary_text: summary.summaryText ?? undefined }
        : {}),
      model_used: summary.modelUsed ?? undefined,
      generated_at: summary.generatedAt ?? undefined,
    };
  }

  /**
   * Builds an admin AI summary DTO with full field visibility.
   *
   * Always includes all fields regardless of status, including error_message
   * for debugging failed summarization jobs.
   *
   * Field mapping (camelCase DB -> snake_case API):
   * - summaryId -> summary_id
   * - documentId -> document_id
   * - summaryText -> summary_text
   * - modelUsed -> model_used
   * - generatedAt -> generated_at
   * - errorMessage -> error_message
   *
   * Extra fields vs fromPublic:
   * - summary_id and document_id for database record identification
   * - error_message included regardless of status (null if no error)
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryAdminDto with full field exposure.
   */
  static fromAdmin(summary: AiSummary): AiSummaryAdminDto {
    return {
      summary_id: summary.summaryId,
      document_id: summary.documentId,
      status: summary.status,
      summary_text: summary.summaryText ?? undefined,
      model_used: summary.modelUsed ?? undefined,
      generated_at: summary.generatedAt ?? undefined,
      error_message: summary.errorMessage ?? undefined,
    };
  }
}
