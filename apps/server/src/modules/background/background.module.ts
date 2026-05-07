import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { IamModule } from "@/modules/iam/iam.module";

import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { PaymentModule } from "../payment/payment.module";
import { StudentSyncAdminController } from "./controllers/student-sync-admin.controller";
import { SystemAdminController } from "./controllers/system-admin.controller";
import { CircuitBreakerRecoveryCron } from "./cron/circuit-breaker-recovery.cron";
import { PaymentTimeoutCron } from "./cron/payment-timeout.cron";
import { ReconciliationCron } from "./cron/reconciliation.cron";
import { WorkshopAutoCompleteCron } from "./cron/workshop-auto-complete.cron";
import { LlmSummaryFilter } from "./pipeline/llm-summary.filter";
import { PdfExtractionFilter } from "./pipeline/pdf-extraction.filter";
import { PdfSummaryPipeline } from "./pipeline/pdf-summary.pipeline";
import { PersistResultFilter } from "./pipeline/persist-result.filter";
import { TextCleaningFilter } from "./pipeline/text-cleaning.filter";
import { UpsertRecordFilter } from "./pipeline/upsert-record.filter";
import { StudentSyncErrorsRepository } from "./repositories/student-sync-errors.repository";
import { StudentSyncJobsRepository } from "./repositories/student-sync-jobs.repository";
import { AiSummaryService } from "./services/ai-summary.service";
import { StudentSyncService } from "./services/student-sync.service";
import { SystemMonitorService } from "./services/system-monitor.service";
import { AiSummaryWorker } from "./workers/ai-summary.worker";
import { StudentSyncWorker } from "./workers/student-sync.worker";

// Cron Jobs

// Repositories

// Note: AiSummariesRepository is imported from CatalogModule to avoid duplication

/**
 * Orchestrates all async and scheduled background processing.
 *
 * Owns cron jobs, admin controllers for AI summary, student CSV import,
 * and system monitoring.
 *
 * Business rules:
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
 * @requires BookingModule — provides RegistrationsService (reconciliation).
 * @requires CatalogModule — provides WorkshopsService (AI summary workers).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SharedQueueModule,
    BookingModule,
    CatalogModule,
    PaymentModule,
    IamModule,
  ],
  controllers: [StudentSyncAdminController, SystemAdminController],
  providers: [
    // Pipeline filters (Pipe-and-Filter architecture)
    UpsertRecordFilter,
    PdfExtractionFilter,
    TextCleaningFilter,
    LlmSummaryFilter,
    PersistResultFilter,
    PdfSummaryPipeline,

    AiSummaryService,
    StudentSyncService,
    SystemMonitorService,
    AiSummaryWorker,
    StudentSyncWorker,
    PaymentTimeoutCron,
    ReconciliationCron,
    CircuitBreakerRecoveryCron,
    WorkshopAutoCompleteCron,
    StudentSyncJobsRepository,
    StudentSyncErrorsRepository,
  ],
  exports: [AiSummaryService, StudentSyncService, SystemMonitorService],
})
export class BackgroundModule {}
