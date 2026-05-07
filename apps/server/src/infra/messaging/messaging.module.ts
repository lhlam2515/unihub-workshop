import { BullModule } from "@nestjs/bullmq";
import { getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BullMQAdapter } from "./bullmq.adapter";
import {
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
  DEFAULT_JOB_OPTIONS,
  MESSAGING_TOKEN,
  PER_QUEUE_OPTIONS,
} from "./messaging.constants";
import { NotificationPublisher } from "./notification-publisher";

import type { Queue } from "bullmq";

/**
 * Shared NestJS module configuring BullMQ queue infrastructure and
 * providing type-safe `ITypedMessageQueue` adapters.
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
 * @exports MessagingModule.MESSAGING_TOKEN.* — DI tokens for ITypedMessageQueue.
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
        defaultJobOptions: PER_QUEUE_OPTIONS[NOTIFICATION_QUEUE],
      },
      {
        name: AI_SUMMARY_QUEUE,
        defaultJobOptions: PER_QUEUE_OPTIONS[AI_SUMMARY_QUEUE],
      },
      {
        name: STUDENT_SYNC_QUEUE,
        defaultJobOptions: PER_QUEUE_OPTIONS[STUDENT_SYNC_QUEUE],
      }
    ),
  ],
  providers: [
    NotificationPublisher,
    // Type-safe queue adapters for producers
    {
      provide: MESSAGING_TOKEN.NOTIFICATION_QUEUE,
      useFactory: (queue: Queue) => new BullMQAdapter(queue),
      inject: [getQueueToken(NOTIFICATION_QUEUE)],
    },
    {
      provide: MESSAGING_TOKEN.AI_SUMMARY_QUEUE,
      useFactory: (queue: Queue) => new BullMQAdapter(queue),
      inject: [getQueueToken(AI_SUMMARY_QUEUE)],
    },
    {
      provide: MESSAGING_TOKEN.STUDENT_SYNC_QUEUE,
      useFactory: (queue: Queue) => new BullMQAdapter(queue),
      inject: [getQueueToken(STUDENT_SYNC_QUEUE)],
    },
  ],
  exports: [
    BullModule,
    NotificationPublisher,
    MESSAGING_TOKEN.NOTIFICATION_QUEUE,
    MESSAGING_TOKEN.AI_SUMMARY_QUEUE,
    MESSAGING_TOKEN.STUDENT_SYNC_QUEUE,
  ],
})
export class MessagingModule {}
