import { Injectable, Logger } from "@nestjs/common";

import { AiSummariesRepository } from "@/modules/ai-summary/repositories/ai-summaries.repository";
import { Result } from "@/shared/response/result";

import type { PdfPipelineContext } from "./pipeline-context";
import type { IPipelineFilter } from "./pipeline-filter.interface";

/**
 * Stage 5 filter: Persists the LLM-generated summary to the database.
 *
 * Input fields read from context: `summaryId`, `summaryText`
 * Output fields: None (terminal filter — returns context unchanged).
 *
 * Business rules:
 * - Updates the ai_summaries record status to DONE with the generated text.
 * - If the context has no summaryText (e.g., empty document), persists as
 *   a DONE record with empty text rather than marking as FAILED.
 *
 * Side effects:
 * - Updates the ai_summaries row status to DONE.
 */
@Injectable()
export class PersistResultFilter implements IPipelineFilter<
  PdfPipelineContext,
  PdfPipelineContext
> {
  private readonly logger = new Logger(PersistResultFilter.name);

  readonly name = "PersistResult";

  constructor(private readonly aiSummariesRepo: AiSummariesRepository) {}

  async process(
    context: PdfPipelineContext
  ): Promise<Result<PdfPipelineContext>> {
    if (!context.summaryId) {
      this.logger.error("Cannot persist result: no summaryId in context");
      return Result.fail({
        code: "INTERNAL_ERROR" as const,
        category: "INTERNAL" as const,
        message: "Pipeline context missing summaryId before persist stage.",
      });
    }

    this.logger.log(
      `Persisting summary result for summary ${context.summaryId}`
    );

    const updateResult = await this.aiSummariesRepo.updateStatus(
      context.summaryId,
      "DONE",
      {
        summaryText: context.summaryText,
        rawText: context.rawText,
        modelUsed: context.modelUsed,
      }
    );

    if (updateResult.isFailure) {
      this.logger.error(
        `Failed to persist summary result for summary ${context.summaryId}`,
        { error: updateResult.error.code }
      );
      return Result.fail(updateResult.error);
    }

    this.logger.log(`Summary DONE for summary ${context.summaryId}`);
    return Result.ok(context);
  }
}
