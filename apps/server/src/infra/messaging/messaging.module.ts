/**
 * MessagingModule — NestJS dynamic module for BullMQ queue provisioning.
 *
 * Replaces `@nestjs/bullmq`'s `BullModule.forRootAsync()` + `registerQueue()`.
 * Creates raw BullMQ `Queue` instances and wraps them in `BullMQAdapter`
 * behind `MESSAGING_TOKEN.*` injection tokens. Business modules inject
 * `ITypedMessageQueue` and never see `bullmq` types.
 *
 * Usage (in `AppModule`):
 * ```ts
 * MessagingModule.forRootAsync({
 *   inject: [REDIS_QUEUE_CLIENT],
 *   useFactory: (connection: Redis) => ({ connection }),
 * })
 * ```
 *
 * Design rationale:
 * - NOT `@Global()` — consuming modules must explicitly import `MessagingModule`.
 * - Queue instances are created via factory providers using the raw ioredis `Redis`
 *   connection, bypassing `@nestjs/bullmq` entirely.
 * - Each queue has a dedicated `BullMQAdapter` instance registered under its
 *   `MESSAGING_TOKEN` symbol.
 *
 * Side effects:
 * - Creates 3 BullMQ `Queue` instances (notification, ai-summary, student-sync),
 *   each sharing the provided Redis connection.
 * - Registers `WorkerHost` for lifecycle-managed BullMQ `Worker` creation.
 */

import { Global, Module, type DynamicModule } from "@nestjs/common";
import { Queue } from "bullmq";

import { BullMQAdapter } from "./bullmq.adapter";
import {
  ALL_QUEUES,
  DEFAULT_JOB_OPTIONS,
  JOB_OPTIONS,
  MESSAGING_TOKEN,
  QUEUE_NAME_TOKEN,
} from "./messaging.constants";
import { WorkerHost } from "./worker.host";

import type { Redis } from "ioredis";

@Global()
@Module({})
export class MessagingModule {
  static forRootAsync(options: {
    inject: any[];
    useFactory: (
      ...args: any[]
    ) => { connection: Redis } | Promise<{ connection: Redis }>;
  }): DynamicModule {
    const queueProviders = ALL_QUEUES.map((name) => ({
      provide: QUEUE_NAME_TOKEN[name],
      inject: ["MESSAGING_REDIS_CONNECTION"],
      useFactory: (connection: Redis) => {
        return new Queue(name, {
          connection,
          defaultJobOptions: {
            ...DEFAULT_JOB_OPTIONS,
            ...JOB_OPTIONS[name],
          },
        });
      },
    }));

    const adapterProviders = ALL_QUEUES.map((name) => ({
      provide: MESSAGING_TOKEN[name],
      inject: [QUEUE_NAME_TOKEN[name]],
      useFactory: (queue: Queue) => {
        return new BullMQAdapter(new Map([[name, queue]]));
      },
    }));

    return {
      module: MessagingModule,
      providers: [
        {
          provide: "MESSAGING_REDIS_CONNECTION",
          inject: options.inject,
          useFactory: async (...args: any[]) => {
            const result = await options.useFactory(...args);
            return result.connection;
          },
        },
        ...queueProviders,
        ...adapterProviders,
        WorkerHost,
      ],
      exports: [...ALL_QUEUES.map((name) => MESSAGING_TOKEN[name]), WorkerHost],
    };
  }
}
