import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";

import { AiSummariesRepository } from "@/modules/catalog/repositories/ai-summaries.repository";
import type { AiSummaryJobData } from "@/shared/queues/event-contracts";
import { AI_SUMMARY_QUEUE } from "@/shared/queues/queue.constants";

import { AiSummaryService } from "../services/ai-summary.service";

/**
 * AiSummaryWorker
 *
 * BullMQ queue consumer for AI document summarization.
 * Consumes jobs from the 'ai-summary' queue and delegates to AiSummaryService.
 *
 * Job data format:
 * {
 *   documentId: string,
 *   workshopId: string,
 *   fileUrl: string
 * }
 *
 * Retry strategy (configured via queue defaultJobOptions):
 * - 3 attempts with exponential backoff: 10s, 20s, 40s
 * - LLM timeout (40s) is a terminal failure — no retry
 * - All other errors trigger BullMQ's built-in retry mechanism
 *
 * Job lifecycle:
 * - Completed jobs auto-removed after 1 hour
 * - Failed jobs auto-removed after 24 hours
 */
@Injectable()
@Processor(AI_SUMMARY_QUEUE, {
  concurrency: 1,
})
export class AiSummaryWorker extends WorkerHost {
  private readonly logger = new Logger(AiSummaryWorker.name);

  constructor(
    private readonly aiSummaryService: AiSummaryService,
    private readonly aiSummariesRepo: AiSummariesRepository
  ) {
    super();
  }

  /**
   * Process an AI summary job from the queue.
   *
   * Extracts documentId, workshopId, and fileUrl from the job data and runs
   * the full summarization pipeline through AiSummaryService.
   *
   * Error handling:
   * - LLM_TIMEOUT (40s): Marks the summary as FAILED and returns without
   *   throwing — BullMQ will not retry (terminal failure).
   * - All other errors: Re-throws the error to trigger BullMQ's built-in
   *   exponential backoff retry (3 attempts max).
   *
   * @param job - BullMQ job containing documentId, workshopId, and fileUrl.
   * @returns The generated summary text on success, or undefined on LLM timeout.
   * @throws Error when a retryable failure occurs, triggering BullMQ retry.
   */
  async process(job: Job<AiSummaryJobData>): Promise<any> {
    const { documentId, workshopId, fileUrl } = job.data;

    this.logger.log(`Processing AI summary for document ${documentId}`);

    try {
      // Wrap the entire pipeline with a 40-second timeout (30s LLM + 10s buffer)
      const result = await this.withTimeout(
        this.aiSummaryService.processDocument(documentId, fileUrl, workshopId),
        40000
      );

      if (result.isFailure) {
        this.logger.warn(
          `AI summary failed for document ${documentId}: ${result.error.message}`,
          { code: result.error.code }
        );
        // Throw to trigger BullMQ retry (3 attempts with exponential backoff)
        throw new Error(result.error.message);
      }

      this.logger.log(`AI summary completed for document ${documentId}`);
      return result.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // LLM timeout is a terminal failure — no retry
      if (errorMessage === "LLM_TIMEOUT") {
        this.logger.warn(
          `LLM timeout for document ${documentId}, marking as FAILED (no retry)`
        );

        // Look up the summary record and mark as failed
        const summaryResult =
          await this.aiSummariesRepo.findByDocumentId(documentId);
        if (summaryResult.isSuccess && summaryResult.data) {
          await this.aiSummariesRepo.updateStatus(
            summaryResult.data.summaryId,
            "FAILED",
            "LLM_TIMEOUT"
          );
        }

        // Return without throwing — BullMQ will not retry
        return;
      }

      // For all other errors, re-throw to let BullMQ handle retries
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
