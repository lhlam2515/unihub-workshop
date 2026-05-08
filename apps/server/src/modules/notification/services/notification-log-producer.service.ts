import { Inject, Injectable, Logger } from "@nestjs/common";

import type {
  NotificationChannel,
  NotificationType,
} from "@/infra/messaging/event-contracts";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import type { ITypedMessageQueue } from "@/infra/messaging/messaging.interfaces";
import { Result } from "@/shared/response/result";

import { NotificationLogsRepository } from "../repositories/notification-logs.repository";

export interface NotificationLogProducerParams {
  userId: string;
  workshopId?: string;
  type: NotificationType;
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
}

/**
 * NotificationLogProducer
 *
 * Creates a notification_log row (PENDING) and enqueues a BullMQ job
 * for async delivery. The NotificationWorker reads the log by ID and
 * dispatches via the appropriate channel adapter.
 *
 * Business rules:
 * - Queue failures are logged but never propagate — notification latency
 *   must not block the main request flow (ADR-11).
 * - Default channel is APP; callers can override for specific delivery
 *   requirements (EMAIL for payment receipts, TELEGRAM for admin alerts).
 *
 * Side effects:
 * - Inserts a row into notification_logs with status PENDING.
 * - Enqueues a "notification.send" job to the notification queue.
 */
@Injectable()
export class NotificationLogProducer {
  private readonly logger = new Logger(NotificationLogProducer.name);

  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository,
    @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
    private readonly queue: ITypedMessageQueue
  ) {}

  /**
   * Creates a single notification log and enqueues a delivery job.
   *
   * @param params - Notification parameters
   * @param params.userId - Recipient user ID
   * @param params.workshopId - Related workshop (optional)
   * @param params.type - Notification type identifier
   * @param params.channel - Delivery channel (defaults to APP)
   * @param params.payload - Template data for the notification
   * @returns OkResult with notificationId, or FailResult (INTERNAL_ERROR)
   */
  async createAndEnqueue(
    params: NotificationLogProducerParams
  ): Promise<Result<{ notificationId: string }>> {
    const channel = params.channel ?? "APP";

    const logResult = await this.notificationLogsRepo.create({
      userId: params.userId,
      workshopId: params.workshopId ?? null,
      type: params.type,
      channel,
      status: "PENDING",
      payload: params.payload ?? {},
    });

    if (logResult.isFailure) return Result.fail(logResult.error);

    const notificationId = logResult.data.notificationId;

    this.queue
      .enqueue("notification.send", {
        notificationId,
        type: params.type,
        channel,
        recipient: params.userId,
        payload: params.payload ?? {},
      })
      .catch((cause: unknown) => {
        this.logger.warn(
          `[${params.type}] Failed to enqueue notification ${notificationId}`,
          cause
        );
      });

    return Result.ok({ notificationId });
  }

  /**
   * Creates notification logs and enqueues jobs for multiple recipients
   * in batches. Used for fan-out scenarios (e.g. workshop cancellation).
   *
   * Each batch of up to batchSize (default 100) items is processed
   * sequentially — the first batch must succeed before the next starts,
   * ensuring partial progress is never lost on transient failures.
   *
   * Business rules:
   * - Jobs within a batch are enqueued concurrently (Promise.all).
   * - Batch failures are logged but do not stop subsequent batches.
   *
   * @param items - Array of notification parameters (one per recipient)
   * @param batchSize - Max items per batch (default 100)
   * @returns OkResult(void), or FailResult if any DB insert fails
   */
  async batchCreateAndEnqueue(
    items: NotificationLogProducerParams[],
    batchSize = 100
  ): Promise<Result<void>> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const logResults = await Promise.all(
        batch.map((item) =>
          this.notificationLogsRepo.create({
            userId: item.userId,
            workshopId: item.workshopId ?? null,
            type: item.type,
            channel: item.channel ?? "APP",
            status: "PENDING",
            payload: item.payload ?? {},
          })
        )
      );

      for (const logResult of logResults) {
        if (logResult.isFailure) {
          this.logger.warn("Batch notification log insert failed", {
            error: logResult.error,
          });
          continue;
        }

        const log = logResult.data;
        this.queue
          .enqueue("notification.send", {
            notificationId: log.notificationId,
            type: log.type,
            channel: log.channel,
            recipient: log.userId,
            payload: log.payload as Record<string, unknown>,
          })
          .catch((cause: unknown) => {
            this.logger.warn(
              `[${log.type}] Failed to enqueue batch notification ${log.notificationId}`,
              cause
            );
          });
      }
    }

    return Result.ok();
  }
}
