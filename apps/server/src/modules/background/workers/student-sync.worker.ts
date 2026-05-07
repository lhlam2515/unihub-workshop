import { Injectable, Logger } from "@nestjs/common";

import type { StudentSyncJobData } from "@/infra/messaging/event-contracts";
import { FatalJobError } from "@/infra/messaging/messaging.errors";
import type { IJobHandler } from "@/infra/messaging/messaging.interfaces";
import { RedisService } from "@/infra/redis/redis.service";
import { StudentSyncService } from "@/modules/csv-sync/services/student-sync.service";

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
 * - Acquires distributed lock before processing.
 * - Delegates to StudentSyncService.processJob().
 * - Releases lock on completion in a finally block.
 * - Throws {@link FatalJobError} on failure (no retry — reconcile on next cron tick).
 */
@Injectable()
export class StudentSyncWorker implements IJobHandler<StudentSyncJobData> {
  private readonly logger = new Logger(StudentSyncWorker.name);

  constructor(
    private readonly studentSyncService: StudentSyncService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Processes a student sync job.
   *
   * Acquires a Redis distributed lock before delegating to the service.
   * If another worker is already processing the same job, this invocation
   * is silently skipped.
   *
   * Side effects:
   * - Creates a Redis key `student-sync:job:{jobId}:lock` with TTL.
   * - Removes the Redis key on completion.
   *
   * @param payload - Job payload containing jobId and sourceFileName.
   * @throws {FatalJobError} If the job fails (terminal — no retry).
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
        throw new FatalJobError(
          `Sync job ${jobId} failed: ${result.error.message}`,
          result.error.code
        );
      }

      this.logger.log(`Sync job ${jobId} completed successfully`);
    } finally {
      await this.releaseLock(jobId);
    }
  }

  /**
   * Acquire a distributed Redis lock for a sync job.
   *
   * Uses Redis SET NX to atomically create a lock key only if it does
   * not already exist. Prevents multiple workers from processing the
   * same job concurrently.
   *
   * @param jobId - Sync job UUID.
   * @param ttlSeconds - Lock TTL in seconds (default 3600).
   * @returns true if the lock was acquired, false if already locked.
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
   * @param jobId - Sync job UUID.
   */
  private async releaseLock(jobId: string): Promise<void> {
    const lockKey = `student-sync:job:${jobId}:lock`;
    await this.redisService.del(lockKey);
  }
}
