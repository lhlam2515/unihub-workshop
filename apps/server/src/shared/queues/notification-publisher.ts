import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { NOTIFICATION_QUEUE } from "./queue.constants";

/**
 * Notification Publisher
 *
 * Shared helper for fire-and-forget notification event emission.
 * Wraps the .add().catch() pattern so consuming services do not
 * duplicate the ADR-11 silent-failure logic.
 *
 * Business rules:
 * - Queue failures are silently ignored per ADR-11 (notification latency
 *   must never block the main request flow).
 * - Event ordering is best-effort (BullMQ FIFO within a single process).
 *
 * Side effects:
 * - Enqueues a BullMQ job into the notification queue.
 */
@Injectable()
export class NotificationPublisher {
  private readonly logger = new Logger(NotificationPublisher.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly queue: Queue
  ) {}

  /**
   * Fires a notification event (fire-and-forget).
   *
   * @param eventType - The domain event type (e.g. "registration.confirmed").
   * @param eventData - The event payload (specific to each domain event).
   */
  fire(eventType: string, eventData: object): void {
    this.queue.add(eventType, eventData).catch((cause) => {
      this.logger.warn(`[${eventType}] Failed to enqueue notification`, cause);
    });
  }
}
