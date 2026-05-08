/**
 * Messaging — Queue Names, Job Options & DI Tokens
 *
 * Central registry for everything the messaging infrastructure needs to
 * bootstrap BullMQ queues, configure retry policies, and wire DI tokens.
 *
 * Three layers of tokens:
 * 1. **Queue names** — plain string constants referencing BullMQ queue names.
 * 2. **`MESSAGING_TOKEN`** — NestJS DI tokens that resolve to typed
 *    `ITypedMessageQueue` instances. Business modules inject these.
 * 3. **`QUEUE_NAME_TOKEN`** — Internal DI tokens that resolve to raw
 *    `BullMQ Queue` instances. Only the {@link WorkerHost} and
 *    {@link BullMQAdapter} access these.
 */

import type { JobsOptions } from "bullmq";

// ---------------------------------------------------------------------------
// Queue Names
// ---------------------------------------------------------------------------

/** Dispatch of in-app, email, and Telegram notifications. */
export const NOTIFICATION_QUEUE = "notification";
/** LLM-based workshop summary generation (latency-sensitive, low concurrency). */
export const AI_SUMMARY_QUEUE = "ai-summary";
/** CSV / API-based student record synchronisation. */
export const STUDENT_SYNC_QUEUE = "student-sync";

export const ALL_QUEUES = [
  NOTIFICATION_QUEUE,
  AI_SUMMARY_QUEUE,
  STUDENT_SYNC_QUEUE,
] as const;

// ---------------------------------------------------------------------------
// Job Options
// ---------------------------------------------------------------------------

/**
 * Baseline job options applied to every queue.
 *
 * Completed jobs are auto-removed after 1 hour.
 * Failed  jobs are auto-removed after 24 hours.
 * Default is 1 attempt (no retry).
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
  attempts: 1,
};

/**
 * Per-queue job option overrides.
 *
 * - **notification**: 5 attempts, exponential backoff starting at 5 s.
 * - **ai-summary**:    3 attempts, exponential backoff starting at 10 s.
 * - **student-sync**:  1 attempt (no retry — reconcile on next cron tick).
 */
export const JOB_OPTIONS: Record<string, JobsOptions> = {
  [NOTIFICATION_QUEUE]: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
  },
  [AI_SUMMARY_QUEUE]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
  },
  [STUDENT_SYNC_QUEUE]: {
    attempts: 1,
  },
};

// ---------------------------------------------------------------------------
// NestJS DI Tokens (Public)
// ---------------------------------------------------------------------------

/**
 * NestJS `@Inject()` tokens that resolve to typed `ITypedMessageQueue` instances.
 *
 * Business modules inject these tokens — they never see `bullmq` types.
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(MESSAGING_TOKEN.NOTIFICATION_QUEUE)
 *   private readonly queue: ITypedMessageQueue,
 * ) {}
 * ```
 */
export const MESSAGING_TOKEN = {
  NOTIFICATION_QUEUE: Symbol("MESSAGING_TOKEN:notification"),
  AI_SUMMARY_QUEUE: Symbol("MESSAGING_TOKEN:ai-summary"),
  STUDENT_SYNC_QUEUE: Symbol("MESSAGING_TOKEN:student-sync"),
} as const;

// ---------------------------------------------------------------------------
// NestJS DI Tokens (Internal)
// ---------------------------------------------------------------------------

/**
 * Internal DI tokens that resolve to raw BullMQ `Queue` instances.
 *
 * These are used **only** by:
 * - {@link BullMQAdapter} (wraps Queue to implement ITypedMessageQueue)
 * - {@link WorkerHost}  (creates Workers from Queue config)
 *
 * Business modules MUST NOT import these.
 */
export const QUEUE_NAME_TOKEN = {
  NOTIFICATION_QUEUE: Symbol("QUEUE_NAME_TOKEN:notification"),
  AI_SUMMARY_QUEUE: Symbol("QUEUE_NAME_TOKEN:ai-summary"),
  STUDENT_SYNC_QUEUE: Symbol("QUEUE_NAME_TOKEN:student-sync"),
} as const;
