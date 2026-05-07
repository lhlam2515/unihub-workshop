import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { MessagingModule } from "@/infra/messaging/messaging.module";
import { IamModule } from "@/modules/iam/iam.module";

import { AiSummaryModule } from "../ai-summary/ai-summary.module";
import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CsvSyncModule } from "../csv-sync/csv-sync.module";
import { PaymentModule } from "../payment/payment.module";
import { SystemAdminController } from "./controllers/system-admin.controller";
import { CircuitBreakerRecoveryCron } from "./cron/circuit-breaker-recovery.cron";
import { PaymentTimeoutCron } from "./cron/payment-timeout.cron";
import { ReconciliationCron } from "./cron/reconciliation.cron";
import { WorkshopAutoCompleteCron } from "./cron/workshop-auto-complete.cron";
import { SystemMonitorService } from "./services/system-monitor.service";
import { AiSummaryWorker } from "./workers/ai-summary.worker";
import { NotificationWorker } from "./workers/notification.worker";
import { StudentSyncWorker } from "./workers/student-sync.worker";

/**
 * Orchestrates all scheduled background processing.
 *
 * Owns cron jobs for payment timeout, seat reconciliation,
 * circuit breaker recovery, and workshop auto-completion.
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
  ],
  controllers: [SystemAdminController],
  providers: [
    SystemMonitorService,
    PaymentTimeoutCron,
    ReconciliationCron,
    CircuitBreakerRecoveryCron,
    WorkshopAutoCompleteCron,
    // Workers
    NotificationWorker,
    AiSummaryWorker,
    StudentSyncWorker,
  ],
  exports: [SystemMonitorService],
})
export class BackgroundModule {}
