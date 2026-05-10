import { z } from "zod";

/**
 * SystemMonitorResponseDtos
 *
 * Multiple response shapes for different monitoring endpoints.
 * All fields are camelCase per project convention.
 */

/**
 * PaymentTimeoutJobStatusDto
 *
 * Status of payment timeout background job.
 */
export const PaymentTimeoutJobStatusSchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  timeoutCount: z.number().int().nonnegative(),
  lastRun: z.date(),
  nextRun: z.date(),
  jobStatus: z.enum(["RUNNING", "IDLE", "ERROR"]),
});

export type PaymentTimeoutJobStatusDto = z.infer<
  typeof PaymentTimeoutJobStatusSchema
>;

/**
 * ReconciliationJobStatusDto
 *
 * Status of seat reconciliation background job.
 */
export const ReconciliationJobStatusSchema = z.object({
  totalWorkshops: z.number().int().nonnegative(),
  discrepanciesFound: z.number().int().nonnegative(),
  lastRun: z.date(),
  nextRun: z.date(),
  lastAlert: z.string().optional(),
});

export type ReconciliationJobStatusDto = z.infer<
  typeof ReconciliationJobStatusSchema
>;

/**
 * CircuitBreakerStatusDto
 *
 * Status of a single payment gateway circuit breaker.
 */
export const CircuitBreakerStatusSchema = z.object({
  gateway: z.enum(["VNPAY", "MOMO", "STRIPE"]),
  state: z.enum(["CLOSED", "HALF_OPEN", "OPEN"]),
  failureCount: z.number().int().nonnegative(),
  openedAt: z.date().optional(),
  lastAttempt: z.date().optional(),
  autoCloseAt: z.date().optional(),
});

export type CircuitBreakerStatusDto = z.infer<
  typeof CircuitBreakerStatusSchema
>;

// Array response for listing all circuit breaker statuses
export const CircuitBreakerStatusArraySchema = z.array(
  CircuitBreakerStatusSchema
);
export type CircuitBreakerStatusArrayDto = z.infer<
  typeof CircuitBreakerStatusArraySchema
>;
