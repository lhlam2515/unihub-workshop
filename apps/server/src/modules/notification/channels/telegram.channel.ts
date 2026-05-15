import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type { NotificationType } from "@/infra/messaging/event-contracts";
import type { INotificationChannel } from "./notification-channel.interface";

/**
 * Telegram notification channel adapter.
 *
 * Log-first MVP: logs the delivery intent instead of calling
 * the Telegram Bot API. Real Telegram integration replaces the log line.
 *
 * channelType: "TELEGRAM"
 */
@Injectable()
export class TelegramChannel implements INotificationChannel {
  readonly channelType = "TELEGRAM" as const;
  private readonly logger = new Logger(TelegramChannel.name);

  /**
   * Deliver a notification via Telegram
   *
   * Formats a human-readable log line using the event type and
   * spec-defined payload fields (workshopTitle, amount, etc.).
   *
   * @param recipient - Telegram chat ID
   * @param eventType - The notification event type
   * @param payload - Event-specific payload per spec (camelCase)
   * @param _config - Bot API configuration (unused in MVP)
   * @returns OkResult after logging the delivery intent
   */
  send(
    recipient: string,
    eventType: NotificationType,
    payload: Record<string, unknown>,
    _config: Record<string, unknown>
  ): Promise<Result<void>> {
    void _config;
    const title =
      (payload.workshopTitle as string) ??
      (payload.message as string) ??
      eventType;
    this.logger.log(
      `[TELEGRAM] Chat: ${recipient}, Event: ${eventType}, Title: ${title}`
    );
    return Promise.resolve(Result.ok());
  }
}
