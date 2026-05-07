import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { SharedQueueModule } from "@/infra/messaging/queue.module";
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

// Cron Jobs

// Repositories

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
 * @requires SharedQueueModule — provides BullMQ queue registrations.
 * @requires BookingModule — provides RegistrationsService (reconciliation).
 * @requires CsvSyncModule — provides StudentSyncService (data sync).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SharedQueueModule,
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
  ],
  exports: [SystemMonitorService],
})
export class BackgroundModule {}
