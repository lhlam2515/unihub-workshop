/**
 * Messaging — Domain Errors
 *
 * Defines two distinct error types:
 * - {@link MessagingError}: Infrastructure failures (connection, enqueue).
 * - {@link FatalJobError}: Terminal business-rule failures (worker should NOT retry).
 *
 * Design rationale:
 * - The {@link WorkerHost} catches `FatalJobError` and **returns without
 *   re-throwing**, so BullMQ marks the job as completed (no retry). All other
 *   errors are re-thrown, triggering BullMQ's built-in retry mechanism.
 * - `MessagingError` wraps raw BullMQ / ioredis exceptions so callers catch
 *   a stable type rather than a library-specific one.
 */

/**
 * Raised when a queue infrastructure operation fails.
 *
 * Typical scenarios:
 * - Redis connection lost during `enqueue()`.
 * - BullMQ queue instance not registered for the given queue name.
 * - Serialisation failure before pushing to the queue.
 */
export class MessagingError extends Error {
  /** The job name that was being enqueued when the error occurred (if applicable). */
  public readonly jobName?: string;

  /** The underlying cause (BullMQ exception, ioredis error, etc.). */
  public readonly cause?: unknown;

  constructor(message: string, jobName?: string, cause?: unknown) {
    super(message);
    this.name = "MessagingError";
    this.jobName = jobName;
    this.cause = cause;
  }
}

/**
 * Raised by a job handler to signal a **terminal** failure.
 *
 * When the {@link WorkerHost} catches this error it does NOT re-throw it,
 * so BullMQ marks the job as completed and does NOT retry.
 *
 * Use this for:
 * - Invalid or missing input data.
 * - Entity not found (e.g. notification log, channel config).
 * - Business-rule violations that won't be resolved by retrying.
 *
 * Do NOT use this for transient errors (network timeouts, DB deadlocks,
 * rate-limit responses). Throw a regular `Error` instead so the worker
 * retries according to the queue's `attempts` / `backoff` config.
 */
export class FatalJobError extends Error {
  /** Human-readable explanation of why the failure is terminal. */
  public readonly reason?: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = "FatalJobError";
    this.reason = reason;
  }
}
