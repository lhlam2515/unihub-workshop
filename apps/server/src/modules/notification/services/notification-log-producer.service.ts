import { Inject, Injectable, Logger } from "@nestjs/common";

import type {
  NotificationChannel,
  NotificationType,
} from "@/infra/messaging/event-contracts";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import type { ITypedMessageQueue } from "@/infra/messaging/messaging.interfaces";
import { Result } from "@/shared/response/result";

import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
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
    private readonly channelConfigsRepo: NotificationChannelConfigsRepository,
    @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
    private readonly queue: ITypedMessageQueue
  ) {}

  /**
   * Creates a notification and enqueues delivery via active channels.
   *
   * When a specific channel is provided, creates one log + one job for that
   * channel (backward compatible). When omitted, resolves all active channels
   * and fans out — one log + one job per active channel.
   *
   * Business rules:
   * - Queue failures are logged but never propagate (ADR-11).
   * - When no channel is specified and no active channels exist, returns
   *   OkResult with a sentinel ID — caller flow is never broken.
   * - Channel fan-out uses Promise.allSettled: one channel failing does not
   *   block others from being created and enqueued.
   *
   * @param params - Notification parameters (channel optional)
   * @returns OkResult with notificationId, or FailResult (INTERNAL_ERROR)
   */
  async createAndEnqueue(
    params: NotificationLogProducerParams
  ): Promise<Result<{ notificationId: string }>> {
    if (params.channel) {
      return this.createAndEnqueueForChannel(params, params.channel);
    }

    // No channel specified — resolve active channels and fan-out
    const channelsResult = await this.channelConfigsRepo.findActiveChannels();
    if (channelsResult.isFailure) return Result.fail(channelsResult.error);

    const activeChannels = channelsResult.data.map((c) => c.channelType);

    if (activeChannels.length === 0) {
      this.logger.warn(
        `[${params.type}] No active notification channels configured. Skipping notification for user ${params.userId}.`
      );
      return Result.ok({ notificationId: "skipped-no-active-channels" });
    }

    this.logger.log(
      `[${params.type}] Fanning out to ${activeChannels.length} active channel(s): ${activeChannels.join(", ")}`
    );

    const results = await Promise.allSettled(
      activeChannels.map((channel) =>
        this.createAndEnqueueForChannel(params, channel)
      )
    );

    // Return first successful result
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.isSuccess) {
        return r.value;
      }
    }

    // All failed — return last failure
    const last = results[results.length - 1];
    if (last?.status === "fulfilled") return last.value;
    return Result.fail({
      code: "INTERNAL_ERROR" as const,
      category: "INTERNAL" as const,
      message: "All notification channels failed",
    });
  }

  /**
   * Creates a single notification_log row and enqueues one job
   * for a specific channel.
   */
  private async createAndEnqueueForChannel(
    params: NotificationLogProducerParams,
    channel: NotificationChannel
  ): Promise<Result<{ notificationId: string }>> {
    const logResult = await this.notificationLogsRepo.create({
      userId: params.userId,
      workshopId: params.workshopId ?? null,
      type: params.type,
      channel,
      status: "PENDING",
      payload: params.payload ?? {},
    });

    if (logResult.isFailure) return Result.fail(logResult.error);

    const { notificationId } = logResult.data;

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
          `[${params.type}] Failed to enqueue ${channel} notification ${notificationId}`,
          cause
        );
      });

    this.logger.log(
      `[${params.type}] Created notification_log ${notificationId} for channel ${channel}`
    );

    return Result.ok({ notificationId });
  }

  /**
   * Creates notification logs and enqueues jobs for multiple recipients
   * in batches. Used for fan-out scenarios (e.g. workshop cancellation).
   *
   * When items omit the channel, active channels are resolved once and
   * each item is expanded into N rows (one per active channel).
   * Items with an explicit channel use single-channel behavior.
   *
   * Each batch of up to batchSize (default 100) items is processed
   * sequentially — the first batch must succeed before the next starts.
   *
   * Business rules:
   * - Jobs within a batch are enqueued concurrently (Promise.all).
   * - Batch failures are logged but do not stop subsequent batches.
   */
  async batchCreateAndEnqueue(
    items: NotificationLogProducerParams[],
    batchSize = 100
  ): Promise<Result<void>> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // Resolve active channels once if any item omits channel
      let activeChannels: NotificationChannel[] | null = null;
      const needsChannels = batch.some((item) => !item.channel);
      if (needsChannels) {
        const channelsResult =
          await this.channelConfigsRepo.findActiveChannels();
        if (channelsResult.isFailure) return Result.fail(channelsResult.error);

        activeChannels = channelsResult.data.map((c) => c.channelType);

        if (activeChannels.length === 0) {
          this.logger.warn(
            "No active notification channels configured. Skipping batch."
          );
          return Result.ok();
        }

        this.logger.log(
          `Resolved ${activeChannels.length} active channel(s) for batch fan-out.`
        );
      }

      // Expand items: items without channel become N (one per active channel)
      const expandedItems = batch.flatMap((item) => {
        if (item.channel) return [{ ...item, channel: item.channel }];
        return activeChannels!.map((ch) => ({ ...item, channel: ch }));
      });

      const logResults = await Promise.all(
        expandedItems.map((item) =>
          this.notificationLogsRepo.create({
            userId: item.userId,
            workshopId: item.workshopId ?? null,
            type: item.type,
            channel: item.channel,
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
