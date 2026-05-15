import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

import type { NotificationType } from "@/infra/messaging/event-contracts";
import type { INotificationChannel } from "./notification-channel.interface";

/**
 * Email notification channel adapter.
 *
 * Log-first MVP: logs the delivery intent instead of calling
 * an SMTP provider. Real SMTP integration replaces the log line.
 *
 * channelType: "EMAIL"
 */
@Injectable()
export class EmailChannel implements INotificationChannel {
  readonly channelType = "EMAIL" as const;
  private readonly logger = new Logger(EmailChannel.name);

  /**
   * Deliver a notification via email
   *
   * Formats a human-readable log line using the event type and
   * spec-defined payload fields (workshopTitle, amount, etc.).
   *
   * @param recipient - Recipient email address
   * @param eventType - The notification event type
   * @param payload - Event-specific payload per spec (camelCase)
   * @param _config - SMTP provider configuration (unused in MVP)
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
      (payload.subject as string) ??
      eventType;
    this.logger.log(
      `[EMAIL] To: ${recipient}, Event: ${eventType}, Title: ${title}`
    );
    return Promise.resolve(Result.ok());
  }
}
