import { Injectable, Logger } from "@nestjs/common";

import { Result } from "@/shared/response/result";

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
   * @param recipient - Recipient email address
   * @param payload - Notification data including subject and body
   * @param _config - SMTP provider configuration (unused in MVP)
   * @returns OkResult after logging the delivery intent
   */
  send(
    recipient: string,
    payload: Record<string, unknown>,
    _config: Record<string, unknown>
  ): Promise<Result<void>> {
    void _config;
    this.logger.log(
      `[EMAIL] To: ${recipient}, Subject: ${payload.subject as string}`
    );
    return Promise.resolve(Result.ok());
  }
}
