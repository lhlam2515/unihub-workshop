import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";

import type { StudentSyncJobData } from "@/infra/messaging/event-contracts";
import { STUDENT_SYNC_QUEUE } from "@/infra/messaging/queue.constants";
import { RedisService } from "@/infra/redis/redis.service";

import { StudentSyncService } from "../services/student-sync.service";

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
export class StudentSyncWorker extends WorkerHost {
  private readonly logger = new Logger(StudentSyncWorker.name);

  constructor(
    private readonly studentSyncService: StudentSyncService,
    private readonly redisService: RedisService
  ) {
    super();
  }

  /**
   * Process a student sync job from the queue
   *
   * Acquires a Redis distributed lock before delegating to the service.
   * If another worker is already processing the same job, this invocation
   * is silently skipped.
   *
   * Side effects:
   * - Creates a Redis key `student-sync:job:{jobId}:lock` with TTL
   * - Removes the Redis key on completion
   *
   * @param job - BullMQ job containing jobId and sourceFileName
   */
  async process(job: Job<StudentSyncJobData>): Promise<void> {
    const { jobId } = job.data;

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

      this.logger.log(`Sync job ${jobId} completed successfully`);
    } finally {
      await this.releaseLock(jobId);
    }
  }

  /**
   * Acquire a distributed Redis lock for a sync job
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
   * Release a distributed Redis lock for a sync job
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
