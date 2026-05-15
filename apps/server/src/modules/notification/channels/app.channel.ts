import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type { NotificationType } from "@/infra/messaging/event-contracts";
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
   * Formats a human-readable log line using the event type and
   * spec-defined payload fields (workshopTitle, amount, etc.).
   *
   * @param recipient - User ID for the recipient
   * @param eventType - The notification event type
   * @param payload - Event-specific payload per spec (camelCase)
   * @param _config - Push provider configuration (unused in MVP)
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
      (payload.title as string) ??
      eventType;
    this.logger.log(
      `[APP] User: ${recipient}, Event: ${eventType}, Title: ${title}`
    );
    return Promise.resolve(Result.ok());
  }
}
