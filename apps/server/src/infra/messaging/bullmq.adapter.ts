/**
 * BullMQAdapter — Bridge between `ITypedMessageQueue` and raw BullMQ `Queue`.
 *
 * This is the **only** file in the system that knows how to call
 * `bullmq.Queue.add()`. Business modules inject `ITypedMessageQueue` and
 * never touch BullMQ types directly.
 *
 * Routing rule: the queue name is derived from the job name prefix.
 *   `"notification.dispatch"`  → queue `"notification"`
 *   `"ai-summary.process"`     → queue `"ai-summary"`
 *   `"student-sync.execute"`   → queue `"student-sync"`
 *
 * @throws {MessagingError} wrapping any BullMQ failure during enqueue.
 * @throws {MessagingError} if the queue name cannot be resolved.
 */

import { Queue } from "bullmq";

import { MessagingError } from "./messaging.errors";

import type {
  ITypedMessageQueue,
  JobName,
  JobPayloadMap,
} from "./messaging.interfaces";

export class BullMQAdapter implements ITypedMessageQueue {
  /**
   * @param queues - A map of queue name → BullMQ `Queue` instance.
   *                 Registrations: `"notification" → Queue`, etc.
   */
  constructor(private readonly queues: Map<string, Queue>) {}

  async enqueue(jobName: string, payload: unknown): Promise<void>;
  async enqueue<K extends JobName>(
    jobName: K,
    payload: JobPayloadMap[K]
  ): Promise<void>;
  async enqueue(jobName: string, payload: unknown): Promise<void> {
    const queueName = this.resolveQueueName(jobName);
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new MessagingError(
        `Queue "${queueName}" is not registered`,
        jobName
      );
    }

    try {
      await queue.add(jobName, payload);
    } catch (cause) {
      throw new MessagingError(
        `Failed to enqueue job "${jobName}" on queue "${queueName}"`,
        jobName,
        cause
      );
    }
  }

  /**
   * Extracts the BullMQ queue name from a dotted job name.
   *
   * `"notification.dispatch"` → `"notification"`
   * `"ai-summary.process"`    → `"ai-summary"`
   */
  private resolveQueueName(jobName: string): string {
    const dotIndex = jobName.indexOf(".");
    if (dotIndex === -1) {
      throw new MessagingError(
        `Invalid job name "${jobName}": expected "{queue}.{action}" format`,
        jobName
      );
    }
    return jobName.slice(0, dotIndex);
  }
}
