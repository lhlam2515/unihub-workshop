import { z } from 'zod';

/**
 * SystemMonitorResponseDtos
 *
 * Multiple response shapes for different monitoring endpoints.
 */

/**
 * PaymentTimeoutJobStatusDto
 *
 * Status of payment timeout background job.
 *
 * Shape:
 * {
 *   pending_count: number (PENDING payments),
 *   timeout_count: number (payments with timeout_at < NOW()),
 *   last_run: DateTime,
 *   next_run: DateTime,
 *   job_status: 'RUNNING' | 'IDLE' | 'ERROR'
 * }
 */
export const PaymentTimeoutJobStatusSchema = z.object({
  pending_count: z.number().int().nonnegative(),
  timeout_count: z.number().int().nonnegative(),
  last_run: z.date(),
  next_run: z.date(),
  job_status: z.enum(['RUNNING', 'IDLE', 'ERROR']),
});

export type PaymentTimeoutJobStatusDto = z.infer<
  typeof PaymentTimeoutJobStatusSchema
>;

/**
 * ReconciliationJobStatusDto
 *
 * Status of seat reconciliation background job.
 *
 * Shape:
 * {
 *   total_workshops: number,
 *   discrepancies_found: number,
 *   last_run: DateTime,
 *   next_run: DateTime,
 *   last_alert?: string (last alert timestamp/message)
 * }
 */
export const ReconciliationJobStatusSchema = z.object({
  total_workshops: z.number().int().nonnegative(),
  discrepancies_found: z.number().int().nonnegative(),
  last_run: z.date(),
  next_run: z.date(),
  last_alert: z.string().optional(),
});

export type ReconciliationJobStatusDto = z.infer<
  typeof ReconciliationJobStatusSchema
>;

/**
 * CircuitBreakerStatusDto
 *
 * Status of a single payment gateway circuit breaker.
 *
 * Shape:
 * {
 *   gateway: 'VNPAY' | 'MOMO' | 'STRIPE',
 *   state: 'CLOSED' | 'HALF_OPEN' | 'OPEN',
 *   failure_count: number,
 *   opened_at?: DateTime (when circuit was opened),
 *   last_attempt?: DateTime (last attempt timestamp),
 *   recovery_deadline?: DateTime (when circuit will auto-recover)
 * }
 */
export const CircuitBreakerStatusSchema = z.object({
  gateway: z.enum(['VNPAY', 'MOMO', 'STRIPE']),
  state: z.enum(['CLOSED', 'HALF_OPEN', 'OPEN']),
  failure_count: z.number().int().nonnegative(),
  opened_at: z.date().optional(),
  last_attempt: z.date().optional(),
  recovery_deadline: z.date().optional(),
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
