/**
 * Central registry of BullMQ queue names and default job options.
 *
 * All queue-producing or queue-consuming modules reference these
 * constants rather than raw strings, ensuring consistency across
 * producers, workers, and admin monitoring.
 *
 * Queue lifecycle:
 * - Completed jobs are auto-removed after 1 hour.
 * - Failed jobs are auto-removed after 24 hours.
 * - Each job is attempted at most once (no retries).
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
