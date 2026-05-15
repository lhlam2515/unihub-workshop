import { setTimeout } from "node:timers/promises";

import { Injectable, Logger } from "@nestjs/common";

import type { NotificationType } from "@/infra/messaging/event-contracts";
import { Result } from "@/shared/response/result";

import { notificationErrors } from "../../../shared/response/errors";
import { AppChannel } from "../channels/app.channel";
import { EmailChannel } from "../channels/email.channel";
import { TelegramChannel } from "../channels/telegram.channel";
import { NotificationChannelConfigsRepository } from "../repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "../repositories/notification-logs.repository";

import type { INotificationChannel } from "../channels/notification-channel.interface";

const CHANNEL_TIMEOUT_MS = 5000;

/**
 * NotificationDispatchService
 *
 * Orchestrates the notification delivery pipeline.
 * Owns a channel registry keyed by channel type (Strategy pattern).
 *
 * Dispatch pipeline:
 * 1. Load notification log
 * 2. Load channel config
 * 3. Check is_active
 * 4. Resolve channel strategy from registry
 * 5. Delegate to channel.send() with 5-second timeout
 * 6. Update log: SENT | FAILED
 *
 * Business rules:
 * - Terminal failures (missing log, missing config, inactive, unknown channel)
 *   DO NOT trigger BullMQ retries — the worker returns without throwing.
 * - Channel send failures DO trigger BullMQ retries (the worker throws).
 * - Each channel.send() call is race-limited to 5 seconds — timeouts are
 *   treated as FAILED deliveries with error_message "TIMEOUT".
 *
 * Side effects:
 * - Updates notification_logs.status and sent_at/error_message on each attempt
 */
@Injectable()
export class NotificationDispatchService {
  private readonly channels: Record<string, INotificationChannel>;
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository,
    private readonly channelConfigsRepo: NotificationChannelConfigsRepository,
    emailChannel: EmailChannel,
    telegramChannel: TelegramChannel,
    appChannel: AppChannel
  ) {
    // Registry — add new channels here
    this.channels = {
      EMAIL: emailChannel,
      TELEGRAM: telegramChannel,
      APP: appChannel,
    };
  }

  /**
   * Execute the full notification dispatch pipeline.
   *
   * @param notificationId - UUID of the notification log to process
   * @returns OkResult on successful delivery, or FailResult
   * - NOTIFICATION_LOG_NOT_FOUND: Log record does not exist
   * - NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND: No config for this channel
   * - NOTIFICATION_CHANNEL_INACTIVE: Channel is disabled
   * - NOTIFICATION_CHANNEL_UNKNOWN: No registered adapter
   * - Errors from the channel adapter itself
   */
  async dispatch(notificationId: string): Promise<Result<void>> {
    const logResult = await this.notificationLogsRepo.findById(notificationId);
    if (logResult.isFailure) return Result.fail(logResult.error);

    const log = logResult.data;
    if (!log) {
      return Result.fail(notificationErrors.logNotFound(notificationId));
    }

    const configResult = await this.channelConfigsRepo.findByChannelType(
      log.channel
    );
    if (configResult.isFailure) return Result.fail(configResult.error);

    const config = configResult.data;
    if (!config) {
      await this.notificationLogsRepo.updateStatus(
        notificationId,
        "FAILED",
        undefined,
        `Channel config not found for ${log.channel}`
      );
      return Result.fail(notificationErrors.channelConfigNotFound(log.channel));
    }

    if (!config.isActive) {
      await this.notificationLogsRepo.updateStatus(
        notificationId,
        "FAILED",
        undefined,
        "Channel is inactive"
      );
      return Result.fail(notificationErrors.channelInactive(log.channel));
    }

    const channel = this.channels[log.channel];
    if (!channel) {
      await this.notificationLogsRepo.updateStatus(
        notificationId,
        "FAILED",
        undefined,
        `Unknown channel: ${log.channel}`
      );
      return Result.fail(notificationErrors.channelUnknown(log.channel));
    }

    const recipient =
      ((log.payload as Record<string, unknown>)?.["recipient"] as
        | string
        | undefined) ?? log.userId;

    // Channel send with 5-second timeout
    const sendResult = await this.sendWithTimeout(
      channel,
      log.type,
      recipient,
      log.payload as Record<string, unknown>,
      config.configJson as Record<string, unknown>
    );

    if (sendResult.isFailure) {
      await this.notificationLogsRepo.updateStatus(
        notificationId,
        "FAILED",
        undefined,
        sendResult.error.message
      );
      return Result.fail(sendResult.error);
    }

    await this.notificationLogsRepo.updateStatus(
      notificationId,
      "SENT",
      new Date()
    );
    this.logger.log(`Notification ${notificationId} sent via ${log.channel}`);
    return Result.ok();
  }

  /**
   * Wraps a channel.send() call with a 5-second timeout.
   *
   * Uses Promise.race between the channel adapter and a timer.
   * Timer rejection is caught and returned as a FailResult so
   * the caller does not crash.
   *
   * @param channel - The channel adapter to call
   * @param recipient - Recipient address/identifier
   * @param payload - Notification template data
   * @param config - Channel provider configuration
   * @returns OkResult(void) from the channel, or FailResult on timeout
   */
  private async sendWithTimeout(
    channel: INotificationChannel,
    eventType: NotificationType,
    recipient: string,
    payload: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Result<void>> {
    const result = await Promise.race([
      channel.send(recipient, eventType, payload, config),
      setTimeout(CHANNEL_TIMEOUT_MS, "TIMEOUT" as const),
    ]);

    if (result === "TIMEOUT") {
      return Result.fail(
        notificationErrors.channelTimeout(
          channel.channelType,
          CHANNEL_TIMEOUT_MS
        )
      );
    }

    return result;
  }
}
