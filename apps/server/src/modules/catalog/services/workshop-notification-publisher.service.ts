/**
 * Workshop Notification Publisher
 *
 * Publishes domain events for workshop lifecycle changes (cancellation,
 * emergency updates) to the BullMQ notification queue for async dispatch.
 *
 * Fire-and-forget semantics: never throws to callers. Falls back to
 * application logging if the BullMQ queue is unreachable, ensuring the
 * main request path (workshop cancel/update) is never blocked by a
 * transient queue infrastructure failure.
 *
 * Event contracts:
 * - WORKSHOP_CANCELLED: { workshopId, title, cancelledAt }
 * - WORKSHOP_UPDATED: { workshopId, changes: { roomChanged?, scheduleChanged? } }
 *
 * Business rules:
 * - The queue is best-effort: a failed enqueue logs an error but does not
 *   fail the caller's HTTP response.
 * - Event types match the constants in shared/queues/event-contracts.ts.
 *
 * Side effects:
 * - Enqueues a BullMQ job to the notification queue on each call.
 */

import { Inject } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";

import type { Workshop } from "@/infra/database/types/event-core.types";
import type {
  WorkshopCancelledEventData,
  WorkshopUpdatedEventData,
} from "@/infra/messaging/event-contracts";
import { MESSAGING_TOKEN } from "@/infra/messaging/messaging.constants";
import type { IMessageQueue } from "@/infra/messaging/messaging.interfaces";

@Injectable()
export class WorkshopNotificationPublisher {
  private readonly logger = new Logger(WorkshopNotificationPublisher.name);

  constructor(
    @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
    private readonly notificationQueue: IMessageQueue
  ) {}

  /**
   * Publishes a WORKSHOP_CANCELLED event to the notification queue.
   *
   * Fire-and-forget: logs and swallows any BullMQ connection error so the
   * caller (workshop cancel endpoint) is never delayed or failed by the
   * notification dispatch.
   *
   * Side effects:
   * - Enqueues a BullMQ job with event type "workshop.cancelled".
   * - Falls back to application-level logging on queue failure.
   *
   * @param workshop - The cancelled workshop entity.
   * @returns Promise<void> — Resolves when the job is enqueued or the failure is logged. Never throws.
   */
  async publishCancelled(workshop: Workshop): Promise<void> {
    const event: WorkshopCancelledEventData = {
      workshopId: workshop.workshopId,
      title: workshop.title,
      cancelledAt: new Date().toISOString(),
    };

    try {
      await this.notificationQueue.enqueue("workshop.cancelled", event);
    } catch (error) {
      this.logger.error(
        `[WORKSHOP_CANCELLED] Failed to enqueue: ${(error as Error).message}`
      );
      // Fallback: log locally so event is not completely lost
      this.logger.log(
        `[WORKSHOP_CANCELLED] Workshop "${event.title}" (${event.workshopId}) cancelled`
      );
    }
  }

  /**
   * Publishes a WORKSHOP_UPDATED event after an emergency update.
   *
   * Fire-and-forget: never throws to caller. Falls back to logging on
   * queue infrastructure failure.
   *
   * Side effects:
   * - Enqueues a BullMQ job with event type "workshop.emergency-update".
   * - Falls back to application-level logging on queue failure.
   *
   * @param workshop - The updated workshop entity.
   * @param changes - The scheduling fields that were modified. An undefined value indicates the field was not changed.
   * @returns Promise<void> — Resolves when the job is enqueued or the failure is logged. Never throws.
   */
  async publishEmergencyUpdate(
    workshop: Workshop,
    changes: { roomId?: string; startsAt?: Date; endsAt?: Date }
  ): Promise<void> {
    const event: WorkshopUpdatedEventData = {
      workshopId: workshop.workshopId,
      changes: {
        roomChanged: changes.roomId !== undefined,
        scheduleChanged:
          changes.startsAt !== undefined || changes.endsAt !== undefined,
      },
    };

    try {
      await this.notificationQueue.enqueue("workshop.emergency-update", event);
    } catch (error) {
      this.logger.error(
        `[WORKSHOP_UPDATED] Failed to enqueue: ${(error as Error).message}`
      );
      this.logger.log(
        `[WORKSHOP_UPDATED] Workshop "${workshop.title}" (${event.workshopId}) ` +
          `schedule changed: ${JSON.stringify(changes)}`
      );
    }
  }
}
