import { Injectable } from '@nestjs/common';
import { Result } from '@shared/response/result';

import { NotificationChannelConfigsRepository } from '../repositories/notification-channel-configs.repository';
import { NotificationLogsRepository } from '../repositories/notification-logs.repository';

/**
 * NotificationDispatchService
 *
 * Executes actual notification sending via different channels.
 * This service is called by NotificationWorker for each notification job.
 *
 * Methods:
 * - dispatch(notificationId) → Send notification via appropriate channel
 *
 * Channel Adapters:
 * - EMAIL (SMTP)
 * - TELEGRAM (Bot API)
 *
 * TODO: Implement channel adapters and dispatch logic
 */
@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository,
    private readonly channelConfigsRepo: NotificationChannelConfigsRepository
  ) {}

  // TODO: Implement dispatch
  async dispatch(notificationId: string): Promise<Result<any>> {
    // 1. Load notification from notificationLogsRepo.findById(notificationId)
    //    - Get notification type, channel, recipient, payload
    //
    // 2. Load channel config from notificationChannelConfigsRepo.findByChannelType(channel)
    //    - Check is_active flag
    //    - Get provider credentials from config_json
    //
    // 3. Route by channel:
    //    a) EMAIL channel → Call EmailProvider.send() with SMTP config
    //    b) TELEGRAM channel → Call TelegramProvider.send() with Bot API token
    //
    // 4. Handle response:
    //    - If success: Update notification_logs.status = SENT, sent_at = NOW()
    //    - If failure: Update notification_logs.status = FAILED, error_message = message
    //
    // 5. Return result with sent confirmation or error
    //
    // Retry logic is handled by NotificationWorker (exponential backoff)
  }

  // TODO: Implement email provider adapter
  private async sendEmail(
    recipient: string,
    subject: string,
    body: string,
    smtpConfig: any
  ): Promise<Result<any>> {
    // Use nodemailer or similar SMTP library
    // Apply template if needed
    // Return success/failure
  }

  // TODO: Implement Telegram provider adapter
  private async sendTelegram(
    chatId: string,
    message: string,
    botApiToken: string
  ): Promise<Result<any>> {
    // Use axios or similar to call Telegram Bot API
    // Handle API response codes
    // Return success/failure
  }
}
