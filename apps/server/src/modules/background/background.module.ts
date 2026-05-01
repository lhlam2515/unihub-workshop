import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { SharedQueueModule } from "@/shared/queues/queue.module";

import { AppChannel } from "./channels/app.channel";
import { EmailChannel } from "./channels/email.channel";
import { TelegramChannel } from "./channels/telegram.channel";
import { NotificationsAdminController } from "./controllers/notifications-admin.controller";
import { StudentSyncAdminController } from "./controllers/student-sync-admin.controller";
import { SystemAdminController } from "./controllers/system-admin.controller";
import { PaymentTimeoutCron } from "./cron/payment-timeout.cron";
import { ReconciliationCron } from "./cron/reconciliation.cron";
import { NotificationChannelConfigsRepository } from "./repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "./repositories/notification-logs.repository";
import { StudentSyncErrorsRepository } from "./repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "./repositories/student-sync-jobs.repository";
import { AiSummaryService } from "./services/ai-summary.service";
import { NotificationDispatchService } from "./services/notification-dispatch.service";
import { NotificationsService } from "./services/notifications.service";
import { StudentSyncService } from "./services/student-sync.service";
import { SystemMonitorService } from "./services/system-monitor.service";
import { AiSummaryWorker } from "./workers/ai-summary.worker";
import { NotificationWorker } from "./workers/notification.worker";
import { StudentSyncWorker } from "./workers/student-sync.worker";

// Cron Jobs

// Repositories

// Note: AiSummariesRepository is imported from CatalogModule to avoid duplication

/**
 * Orchestrates all async and scheduled background processing.
 *
 * Owns the workers, cron jobs, and admin controllers for notification
 * dispatch, AI document summarization, student CSV import, payment
 * timeout expiry, and seat-reconciliation monitoring.
 *
 * Business rules:
 * - Notification delivery uses retry-with-backoff per channel type.
 * - Seat reconciliation runs on a 10-minute cron cycle.
 * - Payment timeouts expire PENDING registrations after 15 minutes.
 * - Each worker consumes from its dedicated BullMQ queue.
 *
 * Side effects:
 * - Registers cron schedules via @nestjs/schedule.
 * - Registers BullMQ workers via SharedQueueModule queues.
 * - Exposes admin HTTP endpoints for manual job management.
 *
 * @requires SharedQueueModule — provides BullMQ queue registrations.
 */
@Module({
  imports: [ScheduleModule.forRoot(), SharedQueueModule],
  controllers: [
    NotificationsAdminController,
    StudentSyncAdminController,
    SystemAdminController,
  ],
  providers: [
    NotificationsService,
    NotificationDispatchService,
    AiSummaryService,
    StudentSyncService,
    SystemMonitorService,
    NotificationWorker,
    AiSummaryWorker,
    StudentSyncWorker,
    PaymentTimeoutCron,
    ReconciliationCron,
    NotificationLogsRepository,
    NotificationChannelConfigsRepository,
    EmailChannel,
    TelegramChannel,
    AppChannel,
    StudentSyncJobsRepository,
    StudentSyncErrorsRepository,
  ],
  exports: [
    NotificationsService,
    NotificationDispatchService,
    AiSummaryService,
    StudentSyncService,
    SystemMonitorService,
  ],
})
export class BackgroundModule {}
