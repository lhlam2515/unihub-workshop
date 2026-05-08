import type {
  AiSummaryJobData,
  NotificationJobData,
  PaymentEventData,
  RegistrationEventData,
  StudentSyncJobData,
  WorkshopCancelledEventData,
  WorkshopUpdatedEventData,
} from "./event-contracts";

/**
 * Union of all known job names across all queues.
 *
 * Each literal corresponds to a `queue.add(name, data)` call in
 * the codebase. Adding a new event type requires extending this
 * union and the corresponding `JobPayloadMap` entry, ensuring
 * compile-time coverage of all job producers.
 */
export type JobName =
  // -- notification queue --
  | "payment.success"
  | "payment.failed"
  | "registration.confirmed"
  | "notification.send"
  | "workshop.cancelled"
  | "workshop.emergency-update"
  // -- ai-summary queue --
  | "ai-summary.process"
  // -- student-sync queue --
  | "student-sync";

/**
 * Maps each `JobName` literal to its typed event payload.
 *
 * The payload interfaces live in `event-contracts.ts` and are
 * shared between producers (here via `ITypedMessageQueue`) and
 * consumers (via `IJobHandler`).
 */
export interface JobPayloadMap {
  // notification queue
  "payment.success": PaymentEventData;
  "payment.failed": PaymentEventData;
  "registration.confirmed": RegistrationEventData;
  "notification.send": NotificationJobData;
  "workshop.cancelled": WorkshopCancelledEventData;
  "workshop.emergency-update": WorkshopUpdatedEventData;
  // ai-summary queue
  "ai-summary.process": AiSummaryJobData;
  // student-sync queue
  "student-sync": StudentSyncJobData;
}

/**
 * Producer contract — compile-time-safe job enqueueing.
 *
 * Implementations wrap a concrete queue (BullMQ, in-memory for tests, etc.)
 * and call `queue.add(name, payload)` under the hood.
 *
 * Usage:
 * ```ts
 * @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
 * private readonly queue: ITypedMessageQueue;
 *
 * await this.queue.enqueue("workshop.cancelled", { workshopId, title, cancelledAt });
 * ```
 */
export interface ITypedMessageQueue {
  enqueue<K extends JobName>(
    jobName: K,
    payload: JobPayloadMap[K]
  ): Promise<void>;
}

/**
 * Consumer contract — a single job handler that can be registered
 * with any worker runtime.
 *
 * Workers that consume queue jobs implement this interface so the pure
 * business logic is separated from the framework adapter layer (e.g.
 * BullMQ's `WorkerHost.process()`).
 */
export interface IJobHandler<T> {
  handle(payload: T): Promise<void>;
}
