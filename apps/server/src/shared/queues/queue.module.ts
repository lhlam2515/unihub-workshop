import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

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
 * - The ai-summary and student-sync queues use one attempt (no retry).
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
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL },
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
      { name: AI_SUMMARY_QUEUE },
      { name: STUDENT_SYNC_QUEUE }
    ),
  ],
  exports: [BullModule],
})
export class SharedQueueModule {}
