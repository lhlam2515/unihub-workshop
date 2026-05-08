/**
 * AI Summary Response DTOs
 *
 * Two shapes:
 * - AiSummaryPublicDto: { status, summaryText, modelUsed, generatedAt }
 * - AiSummaryAdminDto: extends with summaryId, workshopId, errorMessage
 *
 * All fields are camelCase per project convention:
 * "All JSON request/response fields use camelCase (workshopId, startsAt,
 *  seatsAvailable). Snake_case is only used at the PostgreSQL layer."
 */

import type { AiSummary } from "@/infra/database/types/async.types";

export interface AiSummaryPublicDto {
  status: string;
  summaryText?: string;
  modelUsed?: string;
  generatedAt?: Date;
}

export interface AiSummaryAdminDto extends AiSummaryPublicDto {
  summaryId: string;
  workshopId: string;
  errorMessage?: string;
}

export class AiSummaryResponseBuilder {
  /**
   * Builds a public AI summary DTO with conditional field exposure.
   *
   * Business rules:
   * - summaryText is only included when status === 'DONE' to avoid exposing
   *   partial or failed content to public users. Other statuses omit the field entirely.
   *
   * Internal fields excluded:
   * - summaryId, workshopId, errorMessage — not exposed to public users
   *
   * Field mapping (DB camelCase -> API camelCase):
   * - summaryText mapped directly
   * - modelUsed mapped directly
   * - generatedAt mapped directly
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryPublicDto with consumer-safe fields.
   */
  static fromPublic(summary: AiSummary): AiSummaryPublicDto {
    return {
      status: summary.status,
      ...(summary.status === "DONE"
        ? { summaryText: summary.summaryText ?? undefined }
        : {}),
      modelUsed: summary.modelUsed ?? undefined,
      generatedAt: summary.generatedAt ?? undefined,
    };
  }

  /**
   * Builds an admin AI summary DTO with full field visibility.
   *
   * Always includes all fields regardless of status, including errorMessage
   * for debugging failed summarization jobs.
   *
   * Extra fields vs fromPublic:
   * - summaryId and workshopId for database record identification
   * - errorMessage included regardless of status (null if no error)
   *
   * @param summary - Raw AI summary entity from the database.
   * @returns AiSummaryAdminDto with full field exposure.
   */
  static fromAdmin(summary: AiSummary): AiSummaryAdminDto {
    return {
      summaryId: summary.summaryId,
      workshopId: summary.workshopId,
      status: summary.status,
      summaryText: summary.summaryText ?? undefined,
      modelUsed: summary.modelUsed ?? undefined,
      generatedAt: summary.generatedAt ?? undefined,
      errorMessage: summary.errorMessage ?? undefined,
    };
  }
}
