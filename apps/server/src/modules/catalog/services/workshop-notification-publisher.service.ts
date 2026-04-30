/**
 * Workshop Notification Publisher
 *
 * Publishes domain events for workshop lifecycle changes (cancellation,
 * emergency updates). Currently logs events to the application logger.
 * Designed as an adapter — when the Background module's queue infrastructure
 * is ready, this service will push events to BullMQ queues for async dispatch
 * (email, Telegram, push notifications).
 *
 * Event contracts:
 * - WORKSHOP_CANCELLED: { workshopId, title, cancelledAt }
 * - WORKSHOP_UPDATED: { workshopId, title, changes: { roomId?, startsAt?, endsAt? }, updatedAt }
 */

import { Injectable, Logger } from "@nestjs/common";

import type { Workshop } from "@/database/types/event-core.types";

export interface WorkshopCancelledEvent {
  workshopId: string;
  title: string;
  cancelledAt: Date;
}

export interface WorkshopUpdatedEvent {
  workshopId: string;
  title: string;
  changes: {
    roomId?: string;
    startsAt?: Date;
    endsAt?: Date;
  };
  updatedAt: Date;
}

@Injectable()
export class WorkshopNotificationPublisher {
  private readonly logger = new Logger(WorkshopNotificationPublisher.name);

  /**
   * Publishes a WORKSHOP_CANCELLED event.
   *
   * Business rules:
   * - Fire-and-forget: does not throw or fail the caller on error.
   * - Currently logs to the application logger.
   * - Will push to BullMQ WORKSHOP_EVENTS queue when infrastructure is ready.
   *
   * Side effects:
   * - Logs the event (future: enqueues a BullMQ job for NotificationWorker).
   *
   * @param workshop - The cancelled workshop entity.
   */
  publishCancelled(workshop: Workshop): void {
    const event: WorkshopCancelledEvent = {
      workshopId: workshop.workshopId,
      title: workshop.title,
      cancelledAt: new Date(),
    };

    this.logger.log(
      `[WORKSHOP_CANCELLED] Workshop "${event.title}" (${event.workshopId}) cancelled`
    );
    // TODO: Push to BullMQ WORKSHOP_EVENTS queue when background infrastructure is set up
    // await this.workshopEventsQueue.add('workshop.cancelled', event);
  }

  /**
   * Publishes a WORKSHOP_UPDATED event after an emergency update.
   *
   * Business rules:
   * - Fire-and-forget: does not throw or fail the caller on error.
   * - Only includes the fields that actually changed (roomId, startsAt, endsAt).
   * - Currently logs to the application logger.
   *
   * Side effects:
   * - Logs the event (future: enqueues a BullMQ job for NotificationWorker).
   *
   * @param workshop - The updated workshop entity.
   * @param changes - The scheduling fields that changed (roomId?, startsAt?, endsAt?).
   */
  publishEmergencyUpdate(
    workshop: Workshop,
    changes: { roomId?: string; startsAt?: Date; endsAt?: Date }
  ): void {
    const event: WorkshopUpdatedEvent = {
      workshopId: workshop.workshopId,
      title: workshop.title,
      changes,
      updatedAt: new Date(),
    };

    this.logger.log(
      `[WORKSHOP_UPDATED] Workshop "${event.title}" (${event.workshopId}) ` +
        `schedule changed: ${JSON.stringify(changes)}`
    );
    // TODO: Push to BullMQ WORKSHOP_EVENTS queue when background infrastructure is set up
    // await this.workshopEventsQueue.add('workshop.emergency-update', event);
  }
}
