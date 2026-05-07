import { Injectable, Logger } from "@nestjs/common";

import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";
import { Result } from "@/shared/response/result";

import type { PdfPipelineContext } from "./pipeline-context";
import type { IPipelineFilter } from "./pipeline-filter.interface";

/**
 * Stage 1 filter: Creates or resets an ai_summaries record for the document.
 *
 * Input fields read from context: `documentId`, `workshopId`
 * Output fields written to context: `summaryId`
 *
 * Business rules:
 * - Uses ON CONFLICT DO UPDATE to handle retries — if a summary already
 *   exists for this document, its status is reset to PENDING.
 * - Enforces the one-summary-per-document constraint at the DB level.
 *
 * Side effects:
 * - Inserts or updates a row in the ai_summaries table.
 */
@Injectable()
export class UpsertRecordFilter implements IPipelineFilter<
  PdfPipelineContext,
  PdfPipelineContext
> {
  private readonly logger = new Logger(UpsertRecordFilter.name);

  readonly name = "UpsertRecord";

  constructor(private readonly aiSummariesRepo: AiSummariesRepository) {}

  async process(
    context: PdfPipelineContext
  ): Promise<Result<PdfPipelineContext>> {
    this.logger.log(
      `Upserting summary record for document ${context.documentId}`
    );

    const upsertResult = await this.aiSummariesRepo.upsert(
      context.documentId,
      context.workshopId
    );

    if (upsertResult.isFailure) {
      this.logger.error(
        `Failed to upsert summary for document ${context.documentId}`,
        { error: upsertResult.error.code }
      );
      return Result.fail(upsertResult.error);
    }

    return Result.ok({
      ...context,
      summaryId: upsertResult.data.summaryId,
    });
  }
}
