import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";

import type { StudentSyncJobData } from "@/infra/messaging/event-contracts";
import { STUDENT_SYNC_QUEUE } from "@/infra/messaging/messaging.constants";
import type { IJobHandler } from "@/infra/messaging/messaging.interfaces";
import { RedisService } from "@/infra/redis/redis.service";
import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";
import { UsersService } from "@/modules/iam/services/users.service";
import { NotificationLogProducer } from "@/modules/notification/services/notification-log-producer.service";

/**
 * StudentSyncWorker
 *
 * Queue consumer for bulk student data synchronization.
 * Listens to 'student-sync' queue and processes each sync job.
 *
 * Concurrency control:
 * - Uses Redis distributed lock to prevent parallel processing
 *   of the same job across multiple worker instances.
 * - Lock key: `student-sync:job:{jobId}:lock`
 * - Lock TTL: 3600 seconds (estimated max job duration)
 *
 * Job lifecycle:
 * - Acquires distributed lock before processing
 * - Delegates to StudentSyncService.processJob()
 * - Releases lock on completion in a finally block
 * - Does NOT throw on failure (data sync jobs should not retry)
 */
@Injectable()
@Processor(STUDENT_SYNC_QUEUE, { concurrency: 1 })
export class StudentSyncWorker
  extends WorkerHost
  implements IJobHandler<StudentSyncJobData>
{
  private readonly logger = new Logger(StudentSyncWorker.name);

  constructor(
    private readonly studentSyncService: StudentSyncService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly notificationLogProducer: NotificationLogProducer
  ) {
    super();
  }

  /** BullMQ adapter — delegates to the typed handler. */
  async process(job: Job<StudentSyncJobData>): Promise<void> {
    return this.handle(job.data);
  }

  /**
   * Process a student sync job from the queue.
   *
   * Acquires a Redis distributed lock before delegating to the service.
   * If another worker is already processing the same job, this invocation
   * is silently skipped.
   *
   * Side effects:
   * - Creates a Redis key `student-sync:job:{jobId}:lock` with TTL
   * - Removes the Redis key on completion
   *
   * @param payload - Job data containing jobId and sourceFileName
   */
  async handle(payload: StudentSyncJobData): Promise<void> {
    const { jobId } = payload;

    this.logger.log(`Processing sync job ${jobId}`);

    // Acquire distributed lock to prevent parallel processing of the same job
    const lockAcquired = await this.acquireLock(jobId);
    if (!lockAcquired) {
      this.logger.warn(
        `Sync job ${jobId} is already being processed, skipping`
      );
      return;
    }

    try {
      const result = await this.studentSyncService.processJob(jobId);

      if (result.isFailure) {
        this.logger.error(`Sync job ${jobId} failed: ${result.error.message}`);
        // Data sync jobs should not retry — failure is final
        return;
      }

      const { totalRows, processedRows, errorRows } = result.data;

      this.logger.log(
        `Sync job ${jobId} completed successfully: ${processedRows}/${totalRows} rows processed, ${errorRows} errors`
      );

      // Notify BTC users if there are errors
      if (errorRows > 0) {
        await this.notifyBtcUsers({
          jobId,
          totalRows,
          processedRows,
          errorRows,
        });
      }
    } finally {
      await this.releaseLock(jobId);
    }
  }

  /**
   * Sends CSV_IMPORT_COMPLETED_WITH_ERRORS notification to all BTC users.
   *
   * Business rules:
   * - Finds all users with role BTC via UsersService.
   * - Creates one notification per BTC user via batchCreateAndEnqueue.
   * - Notification failures are logged but never throw (fire-and-forget).
   *
   * Side effects:
   * - Inserts notification_log rows for each BTC user.
   * - Enqueues notification.send jobs to the notification queue.
   */
  private async notifyBtcUsers(params: {
    jobId: string;
    totalRows: number;
    processedRows: number;
    errorRows: number;
  }): Promise<void> {
    try {
      const usersResult = await this.usersService.listUsers("BTC", {
        page: 1,
        limit: 100,
      });

      if (usersResult.isFailure || usersResult.data.items.length === 0) {
        this.logger.warn("No BTC users found to notify about sync errors");
        return;
      }

      const btcUserIds = usersResult.data.items.map((user) => user.userId);

      await this.notificationLogProducer.batchCreateAndEnqueue(
        btcUserIds.map((userId) => ({
          userId,
          type: "CSV_IMPORT_COMPLETED_WITH_ERRORS" as const,
          channel: "APP" as const,
          payload: {
            date: new Date().toISOString().slice(0, 10),
            totalRows: params.totalRows,
            successCount: params.processedRows,
            failedCount: params.errorRows,
            errorFileUrl: `/admin/imports/errors/${new Date().toISOString().slice(0, 10)}`,
          },
        }))
      );

      this.logger.log(
        `Notified ${btcUserIds.length} BTC users about sync errors`
      );
    } catch (error) {
      this.logger.error("Failed to notify BTC users about sync errors", error);
    }
  }

  /**
   * Acquire a distributed Redis lock for a sync job.
   *
   * Uses Redis SET NX to atomically create a lock key only if it does
   * not already exist. Prevents multiple workers from processing the
   * same job concurrently.
   *
   * @param jobId - Sync job UUID
   * @param ttlSeconds - Lock TTL in seconds (default 3600)
   * @returns true if the lock was acquired, false if already locked
   */
  private async acquireLock(
    jobId: string,
    ttlSeconds: number = 3600
  ): Promise<boolean> {
    const lockKey = `student-sync:job:${jobId}:lock`;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return this.redisService.setNx(lockKey, token, ttlSeconds);
  }

  /**
   * Release a distributed Redis lock for a sync job.
   *
   * Deletes the lock key so other workers can process the job.
   *
   * Side effects: Removes the Redis key `student-sync:job:{jobId}:lock`.
   *
   * @param jobId - Sync job UUID
   */
  private async releaseLock(jobId: string): Promise<void> {
    const lockKey = `student-sync:job:${jobId}:lock`;
    await this.redisService.del(lockKey);
  }
}
