import { Module, OnModuleInit } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { WorkerHost } from "@/infra/messaging/worker.host";
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
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
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
export class BackgroundModule implements OnModuleInit {
  constructor(
    private readonly workerHost: WorkerHost,
    private readonly notificationWorker: NotificationWorker,
    private readonly aiSummaryWorker: AiSummaryWorker,
    private readonly studentSyncWorker: StudentSyncWorker
  ) {}

  /**
   * Registers all job handlers with the WorkerHost on module initialization.
   *
   * This replaces @nestjs/bullmq's `@Processor` decorator-based auto-discovery.
   * Each worker is registered with its queue name, job name, and concurrency.
   *
   * Side effects:
   * - Creates 3 BullMQ Worker instances (notification, ai-summary, student-sync).
   * - Binds event hooks (completed, failed, stalled) on each worker.
   */
  onModuleInit() {
    this.workerHost.registerHandlers(
      "notification",
      [{ jobName: "notification.dispatch", handler: this.notificationWorker }],
      5
    );

    this.workerHost.registerHandlers(
      "ai-summary",
      [{ jobName: "ai-summary.process", handler: this.aiSummaryWorker }],
      1
    );

    this.workerHost.registerHandlers(
      "student-sync",
      [{ jobName: "student-sync.execute", handler: this.studentSyncWorker }],
      1
    );
  }
}
