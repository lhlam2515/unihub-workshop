import { Injectable, Logger } from "@nestjs/common";

import type { AiSummaryJobData } from "@/infra/messaging/event-contracts";
import { FatalJobError } from "@/infra/messaging/messaging.errors";
import type { IJobHandler } from "@/infra/messaging/messaging.interfaces";
import { AiSummaryService } from "@/modules/ai-summary/services/ai-summary.service";

/**
 * AiSummaryWorker
 *
 * BullMQ queue consumer for AI document summarization.
 * Consumes jobs from the 'ai-summary' queue and delegates to AiSummaryService.
 *
 * Retry strategy (configured via queue defaultJobOptions):
 * - 3 attempts with exponential backoff: 10s, 20s, 40s.
 * - LLM timeout (40s) throws {@link FatalJobError} (no retry).
 * - All other errors are re-thrown as plain Error (triggers BullMQ retry).
 *
 * Job lifecycle:
 * - Completed jobs auto-removed after 1 hour.
 * - Failed jobs auto-removed after 24 hours.
 */
@Injectable()
export class AiSummaryWorker implements IJobHandler<AiSummaryJobData> {
  private readonly logger = new Logger(AiSummaryWorker.name);

  constructor(private readonly aiSummaryService: AiSummaryService) {}

  /**
   * Processes an AI summary job.
   *
   * Runs the full summarization pipeline through AiSummaryService
   * with a 40-second timeout.
   *
   * Error handling:
   * - LLM_TIMEOUT (40s): Marks the summary as FAILED and throws
   *   {@link FatalJobError} — WorkerHost skips retry.
   * - All other errors: Re-throws as plain Error to trigger BullMQ's
   *   built-in exponential backoff retry (3 attempts max).
   *
   * @param payload - Job payload containing documentId, workshopId, fileUrl.
   * @throws {FatalJobError} On LLM timeout (terminal, no retry).
   * @throws {Error} On transient failures (triggers BullMQ retry).
   */
  async handle(payload: AiSummaryJobData): Promise<void> {
    const { documentId, workshopId, fileUrl } = payload;

    this.logger.log(`Processing AI summary for document ${documentId}`);

    try {
      const result = await this.withTimeout(
        this.aiSummaryService.processDocument(documentId, fileUrl, workshopId),
        40000
      );

      if (result.isFailure) {
        this.logger.warn(
          `AI summary failed for document ${documentId}: ${result.error.message}`,
          { code: result.error.code }
        );
        throw new Error(result.error.message);
      }

      this.logger.log(`AI summary completed for document ${documentId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // LLM timeout is a terminal failure — no retry
      if (errorMessage === "LLM_TIMEOUT") {
        this.logger.warn(
          `LLM timeout for document ${documentId}, marking as FAILED (no retry)`
        );

        await this.aiSummaryService.handleTimeout(documentId);

        throw new FatalJobError(
          `LLM timeout for document ${documentId}`,
          "LLM_TIMEOUT"
        );
      }

      this.logger.error(
        `AI summary error for document ${documentId}: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Wraps a promise with a timeout boundary.
   *
   * If the promise does not settle within the specified time, the wrapper
   * rejects with an `LLM_TIMEOUT` error.
   *
   * @param promise - The async operation to time-bound.
   * @param timeoutMs - Maximum time in milliseconds before timeout.
   * @returns The resolved value of the wrapped promise.
   * @throws Error with message 'LLM_TIMEOUT' when the time boundary is exceeded.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeoutMs)
      ),
    ]);
  }
}
