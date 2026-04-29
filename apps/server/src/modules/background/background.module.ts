import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

// Controllers
import { NotificationsAdminController } from "./controllers/notifications-admin.controller";
import { StudentSyncAdminController } from "./controllers/student-sync-admin.controller";
import { SystemAdminController } from "./controllers/system-admin.controller";

// Services
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

// Workers (Queue Consumers)
import { AiSummaryWorker } from "./workers/ai-summary.worker";
import { NotificationWorker } from "./workers/notification.worker";
import { StudentSyncWorker } from "./workers/student-sync.worker";

// Cron Jobs

// Repositories

// Note: AiSummariesRepository is imported from CatalogModule to avoid duplication

/**
 * BackgroundModule
 *
 * Handles all async/scheduled tasks:
 * - Notifications: send via email/telegram with retry logic
 * - AI Summarization: document processing via Claude API
 * - Student Sync: bulk CSV import with error tracking
 * - Payment Timeouts: cron job to expire pending payments
 * - Reconciliation: seat counter consistency check
 * - System Monitoring: job health and circuit breaker status
 *
 * Dependencies:
 * - @nestjs/schedule (for @Cron decorators)
 * - Bull/BullMQ (for job queue, optional for MVP)
 * - EventEmitter2 (alternative to Bull for MVP)
 *
 * Imports:
 * - DatabaseModule (for repositories)
 * - RedisModule (for mechanics and caching)
 * - CatalogModule (for AiSummariesRepository)
 * - BookingModule (for payment data)
 *
 * TODO: Setup queue library configuration (Bull/BullMQ or EventEmitter2)
 * TODO: Implement all TODO comments in services, workers, and cron jobs
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    // TODO: Import queue module here
    // BullModule.forRoot({ ... }),
    // or EventEmitterModule for event-based approach
    //
    // TODO: Import feature modules
    // CatalogModule, DatabaseModule, RedisModule
  ],
  controllers: [
    NotificationsAdminController,
    StudentSyncAdminController,
    SystemAdminController,
  ],
  providers: [
    // Services
    NotificationsService,
    NotificationDispatchService,
    AiSummaryService,
    StudentSyncService,
    SystemMonitorService,
    // Workers
    NotificationWorker,
    AiSummaryWorker,
    StudentSyncWorker,
    // Cron Jobs
    PaymentTimeoutCron,
    ReconciliationCron,
    // Repositories
    NotificationLogsRepository,
    NotificationChannelConfigsRepository,
    StudentSyncJobsRepository,
    StudentSyncErrorsRepository,
  ],
  exports: [
    // Export services for use in other modules if needed
    NotificationsService,
    NotificationDispatchService,
    AiSummaryService,
    StudentSyncService,
    SystemMonitorService,
  ],
})
export class BackgroundModule {}
