import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type { INotificationChannel } from "./notification-channel.interface";

/**
 * In-app push notification channel adapter.
 *
 * Log-first MVP: logs the delivery intent instead of calling
 * a push notification service. Real push integration replaces the log line.
 *
 * channelType: "APP"
 */
@Injectable()
export class AppChannel implements INotificationChannel {
  readonly channelType = "APP" as const;
  private readonly logger = new Logger(AppChannel.name);

  /**
   * Deliver a notification via in-app push
   *
   * @param recipient - User ID for the recipient
   * @param payload - Notification data including title and body
   * @param _config - Push provider configuration (unused in MVP)
   * @returns OkResult after logging the delivery intent
   */
  send(
    recipient: string,
    payload: Record<string, unknown>,
    _config: Record<string, unknown>
  ): Promise<Result<void>> {
    void _config;
    this.logger.log(
      `[APP] User: ${recipient}, Title: ${payload.title as string}`
    );
    return Promise.resolve(Result.ok());
  }
}
