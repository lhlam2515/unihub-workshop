/**
 * AI Summary Response DTOs
 *
 * Two shapes:
 * - AiSummaryPublicDto: { status, text, updatedAt }
 * - AiSummaryAdminDto: extends with summaryId, workshopId, errorDetail
 *
 * Maps DB camelCase fields to API camelCase fields matching OpenAPI spec.
 * DB: summaryText, generatedAt, errorMessage → API: text, updatedAt, errorDetail
 */

import type { AiSummary } from "@/infra/database/types/async.types";

export interface AiSummaryPublicDto {
  status: string;
  text?: string;
  updatedAt?: string;
}

export interface AiSummaryAdminDto extends AiSummaryPublicDto {
  summaryId: string;
  workshopId: string;
  errorDetail?: string;
}

export class AiSummaryResponseBuilder {
  /**
   * Builds a public AI summary DTO with conditional field exposure.
   *
   * Business rules:
   * - text is only included when status === 'DONE' to avoid exposing
   *   partial or failed content to public users. Other statuses omit the field entirely.
   *
   * Internal fields excluded:
   * - summaryId, workshopId, errorDetail — not exposed to public users
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryPublicDto with consumer-safe fields.
   */
  static fromPublic(summary: AiSummary): AiSummaryPublicDto {
    return {
      status: summary.status,
      ...(summary.status === "DONE"
        ? { text: summary.summaryText ?? undefined }
        : {}),
      updatedAt: summary.generatedAt?.toISOString() ?? undefined,
    };
  }

  /**
   * Builds an admin AI summary DTO with full field visibility.
   *
   * Always includes all fields regardless of status, including errorDetail
   * for debugging failed summarization jobs.
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryAdminDto with full field exposure.
   */
  static fromAdmin(summary: AiSummary): AiSummaryAdminDto {
    return {
      summaryId: summary.summaryId,
      workshopId: summary.workshopId,
      status: summary.status,
      text: summary.summaryText ?? undefined,
      updatedAt: summary.generatedAt?.toISOString() ?? undefined,
      errorDetail: summary.errorMessage ?? undefined,
    };
  }
}
