import type {
  ITypedMessageQueue,
  JobName,
  JobPayloadMap,
} from "./messaging.interfaces";
import type { Queue } from "bullmq";

/**
 * BullMQ adapter implementing `ITypedMessageQueue`.
 *
 * Wraps a single BullMQ `Queue` instance and delegates `enqueue`
 * calls to `queue.add()`. Each instance serves exactly one queue
 * (notification, ai-summary, or student-sync).
 *
 * Error handling:
 * - All BullMQ errors are wrapped in `MessagingError` so callers never
 *   depend on the `bullmq` package directly.
 */
export class BullMQAdapter implements ITypedMessageQueue {
  constructor(private readonly queue: Queue) {}

  async enqueue<K extends JobName>(
    jobName: K,
    payload: JobPayloadMap[K]
  ): Promise<void> {
    await this.queue.add(jobName, payload);
  }
}
