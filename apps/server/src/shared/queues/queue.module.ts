import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
  DEFAULT_JOB_OPTIONS,
} from "./queue.constants";

/**
 * Shared NestJS module configuring BullMQ queue infrastructure.
 *
 * Registers a BullMQ connection against the `REDIS_URL` environment
 * variable and declares three application queues: notification,
 * ai-summary, and student-sync. Not marked @Global — modules that
 * need queue access must explicitly import this module.
 *
 * Business rules:
 * - The notification queue uses 5 retry attempts with exponential backoff.
 * - The ai-summary queue uses 3 retry attempts with exponential backoff (10s, 20s, 40s).
 * - The student-sync queue uses one attempt (no retry).
 * - Completed jobs are auto-removed after 1 hour.
 * - Failed jobs are auto-removed after 24 hours.
 *
 * Side effects:
 * - Opens a persistent Redis connection at module initialization.
 * - Registers 3 BullMQ queues with the shared Redis backend.
 *
 * @exports BullModule — Enables @InjectQueue() in importing modules.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("redis.url") },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(
      {
        name: NOTIFICATION_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      },
      {
        name: AI_SUMMARY_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      },
      { name: STUDENT_SYNC_QUEUE }
    ),
  ],
  exports: [BullModule],
})
export class SharedQueueModule {}
