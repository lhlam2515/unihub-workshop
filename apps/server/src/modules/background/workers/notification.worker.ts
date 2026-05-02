import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";

import type { NotificationJobData } from "@/shared/queues/event-contracts";
import { NOTIFICATION_QUEUE } from "@/shared/queues/queue.constants";
import type { ErrorCode } from "@/shared/response/types";

import { NotificationDispatchService } from "../services/notification-dispatch.service";

import type { Job } from "bullmq";

/**
 * Error codes that represent terminal failures — the job should NOT be retried.
 *
 * These are business-logic failures (inactive channel, missing config, etc.)
 * that will fail identically on every retry attempt.
 */
const TERMINAL_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "NOTIFICATION_LOG_NOT_FOUND",
  "NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND",
  "NOTIFICATION_CHANNEL_INACTIVE",
  "NOTIFICATION_CHANNEL_UNKNOWN",
]);

/**
 * NotificationWorker
 *
 * Queue consumer for notification delivery.
 * Consumes jobs from the 'notification' BullMQ queue.
 *
 * Retry strategy (configured via queue defaultJobOptions):
 * - 5 attempts with exponential backoff: 5s, 10s, 20s, 40s, 80s
 * - Terminal failures (missing log, inactive channel) return without throwing
 * - Channel send failures throw to trigger BullMQ retry
 *
 * Job lifecycle:
 * - Completed jobs auto-removed after 1 hour
 * - Failed jobs auto-removed after 24 hours
 */
@Injectable()
@Processor(NOTIFICATION_QUEUE, { concurrency: 5 })
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly dispatchService: NotificationDispatchService) {
    super();
  }

  /**
   * Process a notification job from the queue
   *
   * Extracts notificationId from the job data and delegates
   * to the dispatch service. Terminal failures (inactive channel,
   * missing config, unknown channel, missing log) return silently
   * without retry. Channel adapter failures throw to trigger
   * BullMQ's built-in exponential backoff retry.
   *
   * @param job - BullMQ job containing notificationId and metadata
   * @throws Error when a channel adapter fails, triggering BullMQ retry
   */
  async process(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId } = job.data;

    this.logger.log(`Processing notification ${notificationId}`);

    const result = await this.dispatchService.dispatch(notificationId);

    if (result.isFailure) {
      this.logger.warn(
        `Notification ${notificationId} failed: ${result.error.message}`,
        { code: result.error.code }
      );

      // Terminal failures — don't retry (inactive channel, missing config, etc.)
      if (TERMINAL_ERROR_CODES.has(result.error.code)) return;

      // Channel adapter failure — throw to trigger BullMQ retry
      throw new Error(result.error.message);
    }

    this.logger.log(`Notification ${notificationId} completed successfully`);
  }
}
