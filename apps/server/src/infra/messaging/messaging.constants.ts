/**
 * Central registry of BullMQ queue names, DI tokens, and job options.
 *
 * All queue-producing or queue-consuming modules reference these
 * constants rather than raw strings, ensuring consistency across
 * producers, workers, and admin monitoring.
 *
 * Queue lifecycle:
 * - Completed jobs are auto-removed after 1 hour.
 * - Failed jobs are auto-removed after 24 hours.
 * - Default is 1 attempt; individual queues can override with attempts + backoff.
 */
export const NOTIFICATION_QUEUE = "notification";
export const AI_SUMMARY_QUEUE = "ai-summary";
export const STUDENT_SYNC_QUEUE = "student-sync";

export const ALL_QUEUES = [
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
] as const;

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
  attempts: 1,
} as const;

/**
 * Symbol-based DI tokens for the `ITypedMessageQueue` provider per queue.
 *
 * Producers inject via:
 * ```ts
 * @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
 * private readonly queue: ITypedMessageQueue;
 * ```
 */
export const MESSAGING_TOKEN = {
  NOTIFICATION_QUEUE: Symbol("MESSAGING_TOKEN:NOTIFICATION_QUEUE"),
  AI_SUMMARY_QUEUE: Symbol("MESSAGING_TOKEN:AI_SUMMARY_QUEUE"),
  STUDENT_SYNC_QUEUE: Symbol("MESSAGING_TOKEN:STUDENT_SYNC_QUEUE"),
} as const;

/**
 * Per-queue `defaultJobOptions` passed to `BullModule.registerQueue`.
 *
 * Extracted from the module definition so they can be referenced in tests
 * and monitoring dashboards without parsing the module file.
 */
export const PER_QUEUE_OPTIONS = {
  [NOTIFICATION_QUEUE]: {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
  [AI_SUMMARY_QUEUE]: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 10000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
  [STUDENT_SYNC_QUEUE]: {
    attempts: 1,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
} as const;
