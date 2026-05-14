/**
 * AI Summary Response DTOs
 *
 * Shape: { status, text, updatedAt, errorDetail }
 *
 * Maps DB camelCase fields to API camelCase fields matching OpenAPI spec.
 * DB: summaryText, generatedAt, errorMessage → API: text, updatedAt, errorDetail
 */

import type { AiSummary } from "@/infra/database/types/async.types";

export interface AiSummaryPublicDto {
  status: "NONE" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  text: string | null;
  updatedAt: string | null;
  errorDetail: string | null;
}

export type AiSummaryAdminDto = AiSummaryPublicDto;

export class AiSummaryResponseBuilder {
  static empty(): AiSummaryPublicDto {
    return {
      status: "NONE",
      text: null,
      updatedAt: null,
      errorDetail: null,
    };
  }

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
      text: summary.status === "DONE" ? (summary.summaryText ?? null) : null,
      updatedAt: summary.generatedAt?.toISOString() ?? null,
      errorDetail:
        summary.status === "FAILED" ? (summary.errorMessage ?? null) : null,
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
    return this.fromPublic(summary);
  }
}
