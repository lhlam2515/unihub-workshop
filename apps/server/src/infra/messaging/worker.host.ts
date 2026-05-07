/**
 * WorkerHost — Raw BullMQ Worker lifecycle manager.
 *
 * Replaces `@nestjs/bullmq`'s `Processor` decorator + `WorkerHost` base class.
 * Responsibilities:
 * 1. Create and manage raw BullMQ `Worker` instances.
 * 2. Route incoming jobs to registered typed handlers (`IJobHandler<T>`).
 * 3. Handle terminal errors (`FatalJobError`) without retry.
 * 4. Gracefully close all workers on application shutdown.
 *
 * Design rationale:
 * - BullMQ's `Worker` constructor accepts a processor function directly — no
 *   decorators needed. This gives us full control over error routing.
 * - `FatalJobError` is caught and swallowed (worker returns, job marked complete).
 * - Any other thrown `Error` is re-thrown so BullMQ retries per queue config.
 * - `stalledInterval: 60000` and `maxStalledCount: 1` minimise duplicate
 *   processing when a worker crashes mid-job.
 */

import { Logger, OnApplicationShutdown } from "@nestjs/common";
import { Job, Worker } from "bullmq";

import { FatalJobError } from "./messaging.errors";

import type {
  IJobHandler,
  JobName,
  JobPayloadMap,
} from "./messaging.interfaces";
import type { Redis } from "ioredis";

/** Links a typed handler to the job name it processes. */
export interface HandlerRegistration<K extends JobName = JobName> {
  jobName: K;
  handler: IJobHandler<JobPayloadMap[K]>;
}

/**
 * Internal type for the lookup map — erases generics to store handlers
 * with heterogeneous types in a single data structure.
 */
type HandlerMap = Map<string, IJobHandler>;

export class WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkerHost.name);
  private readonly workers: Worker[] = [];

  constructor(private readonly redisConnection: Redis) {}

  /**
   * Registers one or more job handlers on a BullMQ queue.
   *
   * Creates a single `Worker` instance per call. Multiple calls with the same
   * `queueName` create multiple workers on the same queue (increasing
   * throughput).
   *
   * @param queueName   - BullMQ queue name (e.g. `"notification"`).
   * @param registrations - Array of `{ jobName, handler }` pairs.
   * @param concurrency - Max number of jobs this worker processes in parallel (default 1).
   */
  registerHandlers(
    queueName: string,
    registrations: HandlerRegistration[],
    concurrency = 1
  ): void {
    const handlerMap: HandlerMap = new Map();
    for (const reg of registrations) {
      handlerMap.set(reg.jobName, reg.handler);
    }

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const handler = handlerMap.get(job.name);

        if (!handler) {
          this.logger.warn(`No handler registered for job "${job.name}"`);
          throw new FatalJobError(
            `No handler for job "${job.name}"`,
            "UNREGISTERED_JOB"
          );
        }

        try {
          await handler.handle(job.data);
        } catch (error) {
          if (error instanceof FatalJobError) {
            this.logger.warn(
              `Terminal failure processing "${job.name}" (${job.id}): ${error.message}`
            );
            // Do NOT re-throw — BullMQ marks the job as completed, skipping retry.
            return;
          }
          // Re-throw transient errors for BullMQ retry.
          throw error;
        }
      },
      {
        connection: this.redisConnection,
        concurrency,
        stalledInterval: 60000,
        maxStalledCount: 1,
      }
    );

    // --- Event hooks ---

    worker.on("completed", (job: Job) => {
      this.logger.debug(`Job "${job.name}" (${job.id}) completed`);
    });

    worker.on("failed", (job: Job | undefined, error: Error) => {
      const jobId = job?.id ?? "unknown";
      const jobName = job?.name ?? "unknown";
      if (error instanceof FatalJobError) {
        this.logger.warn(
          `Job "${jobName}" (${jobId}) terminally failed: ${error.message}`
        );
      } else {
        this.logger.warn(
          `Job "${jobName}" (${jobId}) will retry: ${error.message}`
        );
      }
    });

    worker.on("stalled", (jobId: string) => {
      this.logger.warn(
        `Job (${jobId}) stalled — another worker may process it`
      );
    });

    this.workers.push(worker);
    this.logger.log(
      `Worker registered for queue "${queueName}" (concurrency=${concurrency}, ${registrations.length} handler(s))`
    );
  }

  /**
   * Gracefully closes all workers on application shutdown.
   *
   * Waits for running jobs to finish and stops accepting new ones.
   * BullMQ's `worker.close()` resolves when all active jobs complete.
   *
   * Side effects: Closes all BullMQ Worker connections.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.workers.length === 0) return;
    this.logger.log(`Closing ${this.workers.length} worker(s)...`);
    await Promise.all(this.workers.map((w) => w.close()));
    this.logger.log("All workers closed");
  }
}
