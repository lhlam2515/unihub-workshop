## 1. Circuit Breaker Recovery Cron (NEW)

- [x] 1.1 Create `circuit-breaker-recovery.cron.ts` with `@Injectable()` and `@Cron("*/30 * * * * *")`
- [x] 1.2 Implement recovery loop over known gateways (VNPAY, MOMO, STRIPE) with hGetAll state check
- [x] 1.3 Implement OPEN→HALF_OPEN transition after 30s cooldown with per-gateway error isolation

## 2. Payment Timeout Cron

- [x] 2.1 Add `@Cron(CronExpression.EVERY_MINUTE)` decorator to `handlePaymentTimeout()`
- [x] 2.2 Query PostgreSQL for PENDING payments where `timeout_at < NOW()` via Drizzle
- [x] 2.3 Call `PaymentsService.expirePayment()` for each overdue payment with error isolation and logging
- [x] 2.4 Inject `PaymentsService`, `DATABASE_CONNECTION`, and `DATABASE_SCHEMA`

## 3. Seat Reconciliation Cron

- [x] 3.1 Add `@Cron(CronExpression.EVERY_10_MINUTES)` decorator to `handleReconciliation()`
- [x] 3.2 Query PUBLISHED workshops with capacity from PostgreSQL
- [x] 3.3 Compare Redis `seat:available:{workshopId}` against DB expected (capacity - confirmed - locked)
- [x] 3.4 Log warnings for discrepancies > DISCREPANCY_THRESHOLD (5); do NOT auto-fix
- [x] 3.5 Inject `RedisService`, `DATABASE_CONNECTION`, and `DATABASE_SCHEMA`

## 4. System Monitor Service

- [x] 4.1 Implement `getPaymentTimeoutJobStatus()` — count PENDING and overdue payments
- [x] 4.2 Implement `getReconciliationJobStatus()` — check all workshops for discrepancies
- [x] 4.3 Implement `getCircuitBreakerStatus()` — read Redis hashes for all 3 gateways
- [x] 4.4 Implement `resetCircuitBreaker(gateway)` — validate gateway, reset Redis hash fields
- [x] 4.5 Use DTO types from `system-monitor-response.dto.ts` for all return types

## 5. System Admin Controller

- [x] 5.1 Wire `GET /admin/system/jobs/payment-timeout` → service method
- [x] 5.2 Wire `GET /admin/system/jobs/reconciliation` → service method
- [x] 5.3 Wire `GET /admin/system/circuit-breaker` → service method
- [x] 5.4 Wire `POST /admin/system/circuit-breaker/:gateway/reset` → service method

## 6. Module Wiring

- [x] 6.1 Add `CircuitBreakerRecoveryCron` to `BackgroundModule.providers`
- [x] 6.2 Add `BookingModule` to `BackgroundModule.imports` for `PaymentsService` injection

## 7. Verification

- [x] 7.1 Run `pnpm check-types --filter=server` — passes
- [x] 7.2 Run `pnpm build --filter=server` — passes
