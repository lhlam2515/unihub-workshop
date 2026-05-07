import { Injectable, Logger } from "@nestjs/common";

import type { NotificationJobData } from "@/infra/messaging/event-contracts";
import { FatalJobError } from "@/infra/messaging/messaging.errors";
import type { IJobHandler } from "@/infra/messaging/messaging.interfaces";
import { NotificationDispatchService } from "@/modules/notification/services/notification-dispatch.service";
import type { ErrorCode } from "@/shared/response/types";

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
 * - Terminal failures throw {@link FatalJobError} (no retry).
 * - Channel send failures throw a plain Error (triggers BullMQ retry).
 *
 * Job lifecycle:
 * - Completed jobs auto-removed after 1 hour.
 * - Failed jobs auto-removed after 24 hours.
 */
@Injectable()
export class NotificationWorker implements IJobHandler<NotificationJobData> {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly dispatchService: NotificationDispatchService) {}

  /**
   * Processes a notification dispatch job.
   *
   * Extracts notificationId from the payload and delegates to the dispatch
   * service. Terminal failures throw {@link FatalJobError} so the
   * {@link WorkerHost} skips retry. Channel adapter failures throw a plain
   * Error so BullMQ retries with exponential backoff.
   *
   * @param payload - Job payload containing notificationId and metadata.
   * @throws {FatalJobError} If the error code is in TERMINAL_ERROR_CODES.
   * @throws {Error} If a channel adapter fails (transient, retryable).
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

      // Terminal failures — throw FatalJobError so WorkerHost skips retry
      if (TERMINAL_ERROR_CODES.has(result.error.code)) {
        throw new FatalJobError(
          `Notification ${notificationId} failed: ${result.error.message}`,
          result.error.code
        );
      }

      // Channel adapter failure — throw plain Error to trigger BullMQ retry
      throw new Error(result.error.message);
    }

    this.logger.log(`Notification ${notificationId} completed successfully`);
  }
}
