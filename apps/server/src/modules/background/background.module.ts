import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { MessagingModule } from "@/infra/messaging/messaging.module";
import { IamModule } from "@/modules/iam/iam.module";

import { AiSummaryModule } from "../ai-summary/ai-summary.module";
import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CsvSyncModule } from "../csv-sync/csv-sync.module";
import { NotificationModule } from "../notification/notification.module";
import { PaymentModule } from "../payment/payment.module";
import { SystemAdminController } from "./controllers/system-admin.controller";
import { IdempotencyCleanupCron } from "./cron/idempotency-cleanup.cron";
import { NotificationLogCleanupCron } from "./cron/notification-log-cleanup.cron";
import { PaymentReconciliationCron } from "./cron/payment-reconciliation.cron";
import { PaymentTimeoutCron } from "./cron/payment-timeout.cron";
import { ReconciliationCron } from "./cron/reconciliation.cron";
import { StudentSyncSchedulerCron } from "./cron/student-sync-scheduler.cron";
import { WorkshopAutoCompleteCron } from "./cron/workshop-auto-complete.cron";
import { SystemMonitorService } from "./services/system-monitor.service";
import { WorkshopCancellationService } from "./services/workshop-cancellation.service";
import { AiSummaryWorker } from "./workers/ai-summary.worker";
import { NotificationWorker } from "./workers/notification.worker";
import { StudentSyncWorker } from "./workers/student-sync.worker";

/**
 * Orchestrates all scheduled background processing.
 *
 * Owns cron jobs for payment timeout, seat reconciliation,
 * and workshop auto-completion.
 *
 * Business rules:
 * - Seat reconciliation runs on a 10-minute cron cycle.
 * - Payment timeouts expire PENDING registrations after 15 minutes.
 *
 * Side effects:
 * - Registers cron schedules via @nestjs/schedule.
 * - Exposes admin HTTP endpoints for manual job management.
 *
 * @requires MessagingModule — provides BullMQ queue registrations.
 * @requires BookingModule — provides RegistrationsService (reconciliation).
 * @requires CsvSyncModule — provides StudentSyncService (data sync).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MessagingModule,
    BookingModule,
    CatalogModule,
    PaymentModule,
    IamModule,
    AiSummaryModule,
    CsvSyncModule,
    NotificationModule,
  ],
  controllers: [SystemAdminController],
  providers: [
    SystemMonitorService,
    PaymentTimeoutCron,
    ReconciliationCron,
    WorkshopAutoCompleteCron,
    // New crons
    IdempotencyCleanupCron,
    NotificationLogCleanupCron,
    PaymentReconciliationCron,
    StudentSyncSchedulerCron,
    // Services
    WorkshopCancellationService,
    // Workers
    NotificationWorker,
    AiSummaryWorker,
    StudentSyncWorker,
  ],
  exports: [SystemMonitorService],
})
export class BackgroundModule {}
