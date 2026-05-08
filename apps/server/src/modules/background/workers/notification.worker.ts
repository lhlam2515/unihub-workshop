import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";

import type {
  NotificationJobData,
  WorkshopCancelledEventData,
} from "@/infra/messaging/event-contracts";
import { NOTIFICATION_QUEUE } from "@/infra/messaging/messaging.constants";
import { FatalJobError } from "@/infra/messaging/messaging.errors";
import type { IJobHandler } from "@/infra/messaging/messaging.interfaces";
import { WorkshopCancellationService } from "@/modules/background/services/workshop-cancellation.service";
import { NotificationDispatchService } from "@/modules/notification/services/notification-dispatch.service";
import type { ErrorCode } from "@/shared/response/types";

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
 * - Terminal failures (missing log, inactive channel) throw FatalJobError
 *   and are caught by process() without retry.
 * - Channel send failures throw Error to trigger BullMQ retry.
 *
 * Job lifecycle:
 * - Completed jobs auto-removed after 1 hour
 * - Failed jobs auto-removed after 24 hours
 */
@Injectable()
@Processor(NOTIFICATION_QUEUE, { concurrency: 5 })
export class NotificationWorker
  extends WorkerHost
  implements IJobHandler<NotificationJobData>
{
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private readonly dispatchService: NotificationDispatchService,
    private readonly cancellationService: WorkshopCancellationService
  ) {
    super();
  }

  /** BullMQ adapter — routes jobs by name to the matching handler. */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "notification.send":
        return this.processNotification(job);
      case "workshop.cancelled":
        return this.processWorkshopCancellation(job);
      default:
        this.logger.warn(`Unhandled job type: ${job.name}`);
    }
  }

  /** Route handler: dispatch a notification. */
  private async processNotification(
    job: Job<NotificationJobData>
  ): Promise<void> {
    try {
      await this.handle(job.data);
    } catch (error) {
      if (error instanceof FatalJobError) return;
      throw error;
    }
  }

  /** Route handler: process a workshop cancellation batch. */
  private async processWorkshopCancellation(
    job: Job<WorkshopCancelledEventData>
  ): Promise<void> {
    await this.cancellationService.handleCancellation(job.data);
  }

  /**
   * Process a notification job from the queue.
   *
   * Extracts notificationId from the job data and delegates
   * to the dispatch service. Terminal failures (inactive channel,
   * missing config, unknown channel, missing log) throw FatalJobError
   * so process() can swallow them without triggering BullMQ retry.
   * Channel adapter failures throw Error to trigger BullMQ retry.
   *
   * @param payload - Job data containing notificationId and metadata
   * @throws FatalJobError when the failure is terminal (no retry).
   * @throws Error when a channel adapter fails (BullMQ retries with backoff).
   */
  async handle(payload: NotificationJobData): Promise<void> {
    const { notificationId } = payload;

    this.logger.log(`Processing notification ${notificationId}`);

    const result = await this.dispatchService.dispatch(notificationId);

    if (result.isFailure) {
      this.logger.warn(
        `Notification ${notificationId} failed: ${result.error.message}`,
        { code: result.error.code }
      );

      // Terminal failures — throw FatalJobError to prevent retry
      if (TERMINAL_ERROR_CODES.has(result.error.code)) {
        throw new FatalJobError(result.error.message);
      }

      // Channel adapter failure — throw to trigger BullMQ retry
      throw new Error(result.error.message);
    }

    this.logger.log(`Notification ${notificationId} completed successfully`);
  }
}
