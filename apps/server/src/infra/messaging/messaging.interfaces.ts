/**
 * Messaging — Producer / Consumer Contracts
 *
 * This is the **only** file that business modules import from the messaging layer.
 * All BullMQ types are hidden behind these abstractions.
 *
 * Design rationale:
 * - `IMessageQueue` is the untyped base: it accepts `string` job names + `unknown`
 *   payloads. Useful for one-off jobs (e.g. `"workshop.cancelled"`) not yet in the
 *   `JobName` union.
 * - `ITypedMessageQueue` extends it with a generic `enqueue<K extends JobName>()`
 *   overload so producers get compile-time payload validation.
 * - `IJobHandler<T>` is the consumer contract; worker implementations receive
 *   already-deserialised payloads directly.
 */

import type {
  AiSummaryJobData,
  NotificationJobData,
  StudentSyncJobData,
} from "./event-contracts";

// ---------------------------------------------------------------------------
// Job Name Registry
// ---------------------------------------------------------------------------

/**
 * Discriminated union of every job name in the system.
 *
 * Convention: `{queue}.{action}` — the part before the first dot is the
 * BullMQ queue name (e.g. `"notification.dispatch"` → queue `"notification"`).
 *
 * Keep this list in sync with the actual jobs enqueued across the codebase.
 */
export type JobName =
  | "ai-summary.process"
  | "notification.dispatch"
  | "student-sync.execute";

/**
 * Maps each {@link JobName} to its typed payload interface.
 *
 * The payload interfaces are defined in `event-contracts.ts` and shared
 * between producers (enqueue) and consumers (handlers).
 */
export interface JobPayloadMap {
  "ai-summary.process": AiSummaryJobData;
  "notification.dispatch": NotificationJobData;
  "student-sync.execute": StudentSyncJobData;
}

// ---------------------------------------------------------------------------
// Producer Abstractions
// ---------------------------------------------------------------------------

/**
 * Untyped message queue — accepts any string job name.
 *
 * Use this for ad-hoc or one-off job names that haven't been added
 * to the {@link JobName} union yet.
 */
export interface IMessageQueue {
  /**
   * Enqueues a job onto the appropriate BullMQ queue.
   *
   * The queue name is derived from the job name prefix: `"notification.dispatch"`
   * routes to the `"notification"` queue.
   *
   * @param jobName - Canonical job name (e.g. `"notification.dispatch"`).
   * @param payload - Serialisable job payload.
   * @throws {MessagingError} If the queue cannot be reached or the enqueue fails.
   */
  enqueue(jobName: string, payload: unknown): Promise<void>;
}

/**
 * Typed message queue — compile-time payload validation.
 *
 * Preferred over {@link IMessageQueue} for all known job types.
 *
 * @example
 * ```ts
 * queue.enqueue("notification.dispatch", {
 *   notificationId: "abc-123",
 *   type: "REGISTRATION_CONFIRMED",
 *   channel: "EMAIL",
 *   recipient: "user@example.com",
 *   payload: {},
 * });
 * ```
 */
export interface ITypedMessageQueue extends IMessageQueue {
  /**
   * Enqueues a typed job.
   *
   * @param jobName - A known {@link JobName} literal.
   * @param payload - Payload matching {@link JobPayloadMap}[K].
   */
  enqueue<K extends JobName>(
    jobName: K,
    payload: JobPayloadMap[K]
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Consumer Abstractions
// ---------------------------------------------------------------------------

/**
 * Contract for a single job handler (consumer).
 *
 * Implement this interface instead of extending `WorkerHost` from `@nestjs/bullmq`.
 * The framework-agnostic `handle(payload)` method receives the deserialised job
 * data directly.
 *
 * Error handling conventions:
 * - Throw {@link FatalJobError} for terminal errors (worker will NOT retry).
 * - Throw any other `Error` for transient errors (worker WILL retry per queue config).
 * - Resolve successfully (`void`) if the job was processed without error.
 */
export interface IJobHandler<T = unknown> {
  /**
   * Processes a single job payload.
   *
   * @param payload - The deserialised job data.
   * @throws {FatalJobError} If the error is terminal (invalid data, not found).
   * @throws {Error} If the error is transient and should be retried.
   */
  handle(payload: T): Promise<void>;
}
