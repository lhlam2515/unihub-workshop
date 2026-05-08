/**
 * Wraps a queue infrastructure failure so callers can distinguish
 * "the queue itself broke" from business-logic errors.
 */
export class MessagingError extends Error {
  readonly name = "MessagingError";

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/**
 * Terminal job error — the job MUST NOT be retried.
 *
 * Workers that encounter a business-rule violation (unknown job name,
 * inactive channel, missing log, etc.) throw `FatalJobError` instead of
 * a generic `Error`. The worker host MUST catch `FatalJobError` and
 * return the job without throwing — preventing BullMQ from retrying.
 */
export class FatalJobError extends Error {
  readonly name = "FatalJobError";

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
