import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { NotificationLogsRepository } from "@/modules/notification/repositories/notification-logs.repository";

/**
 * Nightly cleanup of notification_logs older than 30 days (AC-06).
 *
 * Business rules:
 * - Only deletes rows where created_at < now() - interval '30 days'.
 * - Runs daily at 2:00 AM (low-traffic window).
 * - Errors are logged but never propagated — the cron scheduler must
 *   never crash due to a failed cleanup cycle.
 *
 * Side effects:
 * - Deletes rows from the notification_logs table in a single bulk query.
 */
@Injectable()
export class NotificationLogCleanupCron {
  private readonly logger = new Logger(NotificationLogCleanupCron.name);

  constructor(
    private readonly notificationLogsRepo: NotificationLogsRepository
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCleanup(): Promise<void> {
    try {
      const result = await this.notificationLogsRepo.deleteOlderThan(30);
      if (result.isSuccess) {
        if (result.data.deletedCount > 0) {
          this.logger.log(
            `Cleaned up ${result.data.deletedCount} notification logs older than 30 days`
          );
        }
      } else {
        this.logger.warn(
          `Notification log cleanup failed: ${result.error.code}`
        );
      }
    } catch (error) {
      this.logger.error("Notification log cleanup cron failed", error);
    }
  }
}
