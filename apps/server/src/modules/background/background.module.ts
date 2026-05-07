import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { IamModule } from "@/modules/iam/iam.module";

import { AiSummaryModule } from "../ai-summary/ai-summary.module";
import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { PaymentModule } from "../payment/payment.module";
import { StudentSyncAdminController } from "./controllers/student-sync-admin.controller";
import { SystemAdminController } from "./controllers/system-admin.controller";
import { CircuitBreakerRecoveryCron } from "./cron/circuit-breaker-recovery.cron";
import { PaymentTimeoutCron } from "./cron/payment-timeout.cron";
import { ReconciliationCron } from "./cron/reconciliation.cron";
import { WorkshopAutoCompleteCron } from "./cron/workshop-auto-complete.cron";
import { StudentSyncErrorsRepository } from "./repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "./repositories/student-sync-jobs.repository";
import { StudentSyncService } from "./services/student-sync.service";
import { SystemMonitorService } from "./services/system-monitor.service";
import { StudentSyncWorker } from "./workers/student-sync.worker";

// Cron Jobs

// Repositories

/**
 * Orchestrates all async and scheduled background processing.
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
 * @requires AiSummaryModule — provides AiSummaryService (AI summary tasks).
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
  ],
  controllers: [StudentSyncAdminController, SystemAdminController],
  providers: [
    StudentSyncService,
    SystemMonitorService,
    StudentSyncWorker,
    PaymentTimeoutCron,
    ReconciliationCron,
    CircuitBreakerRecoveryCron,
    WorkshopAutoCompleteCron,
    StudentSyncJobsRepository,
    StudentSyncErrorsRepository,
  ],
  exports: [StudentSyncService, SystemMonitorService],
})
export class BackgroundModule {}
