import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

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
   * @param recipient - Telegram chat ID
   * @param payload - Notification data including message text
   * @param _config - Bot API configuration (unused in MVP)
   * @returns OkResult after logging the delivery intent
   */
  send(
    recipient: string,
    payload: Record<string, unknown>,
    _config: Record<string, unknown>
  ): Promise<Result<void>> {
    void _config;
    this.logger.log(
      `[TELEGRAM] Chat: ${recipient}, Message: ${payload.message as string}`
    );
    return Promise.resolve(Result.ok());
  }
}
