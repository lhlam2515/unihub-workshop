## Context

The background module owns all async and scheduled processing in the system — workers, cron jobs, and admin controllers. Currently the 3 cron jobs (`PaymentTimeoutCron`, `ReconciliationCron`) and `SystemMonitorService` are stubs. The `CircuitBreakerRecoveryCron` doesn't exist yet (its logic is partially duplicated in `CircuitBreakerMechanic.checkAndAllow()`).

W2 (Payment Processing Core) is merged, which provides `PaymentsService.expirePayment()` — the contract method that W4 `PaymentTimeoutCron` calls. The booking module's `CircuitBreakerMechanic` manages the CLOSED→OPEN→HALF_OPEN state machine per gateway in Redis Hashes, but there's currently no background job to detect OPEN circuits past cooldown and transition them to HALF_OPEN — each payment request must trigger the transition inline in `checkAndAllow()`. This cron decouples recovery from the request path.

## Goals / Non-Goals

**Goals:**
- Implement `PaymentTimeoutCron` — query overdue PENDING payments, delegate to `PaymentsService.expirePayment()`, log statistics
- Implement `ReconciliationCron` — compare Redis seat counters against DB for PUBLISHED workshops, log discrepancies > 5, do NOT auto-fix
- Create `CircuitBreakerRecoveryCron` — every 30s, scan known gateways, transition OPEN→HALF_OPEN after 30s cooldown
- Implement `SystemMonitorService` — 4 admin-facing endpoints for job status, circuit breaker state, and manual reset
- Wire all endpoints under `SystemAdminController` with ORGANIZER role guard
- Import `BookingModule` into `BackgroundModule` to inject `PaymentsService`

**Non-Goals:**
- Auto-fix reconciliation discrepancies (must be manual per BR-038)
- Real payment gateway adapters (MOCK only for MVP)
- Alert/notification on circuit breaker transitions (future enhancement)
- Persistent cron metadata table (in-memory status is sufficient for MVP)

## Decisions

### D1: Cron queries DB directly, delegates expiry to PaymentsService

`PaymentTimeoutCron` directly queries PostgreSQL via Drizzle (`this.schema.payments`) to find overdue PENDING payments, then calls `PaymentsService.expirePayment()` for each. This avoids adding a `findPendingOverdue()` method to the background module's own repository layer, and reuses the full ACID transaction logic already in PaymentsService.

**Alternative considered**: Adding `findPendingOverdue()` to `PaymentsRepository` and calling it from `PaymentsService` + cron. Rejected because the cron is not a payment domain consumer — it's a scheduler that finds work items and delegates. Direct DB read is simpler and avoids unnecessary service method churn.

### D2: Reconciliation cron logs discrepancies but does NOT auto-fix

Per BR-038, the reconciliation cron is a safety net, not a source of truth. It logs warnings for discrepancies exceeding 5 seats. Auto-fixing would mask bugs in the seat counter logic (registrations service, payment expiry, check-in) and create silent data corruption risks. Admin intervention is required.

**Alternative considered**: Auto-correct via `RedisService.set()`. Rejected because it would silently overwrite the source-of-truth Redis counter, potentially hiding race conditions in the registration/payment flow.

### D3: CircuitBreakerRecoveryCron uses hardcoded gateways, not Redis SCAN

The known gateways are hardcoded as `["VNPAY", "MOMO", "STRIPE"]` because RedisService does not expose a `keys()`/`scan()` method, and adding one for a single use case would leak infrastructure. The set of gateways is stable and defined in enum `payment_gateway` in the database schema.

### D4: Every 30-second cron for circuit breaker recovery

`*/30 * * * * *` runs every 30 seconds (six times per minute). This is a compromise between responsiveness (OPEN→HALF_OPEN should recover within 30s of cooldown expiry) and Redis load (6 additional `hGetAll` calls per minute per gateway = 18 total, which is negligible).

**Alternative considered**: Event-driven recovery via Redis Keyspace Notifications. Rejected because it adds operational complexity (Redis config, connection management) for minimal latency gain over a 30s poll.

### D5: SystemMonitorService uses try/catch, not tryCatch wrapper

The 4 monitoring methods use native try/catch rather than the repository-level `tryCatch()` utility. This is because these methods mix Redis and Drizzle operations, and the error handling is uniform (catch → `Result.fail(systemErrors.internal())`). Using `tryCatch` per-operation would require nested error mapping for each DB and Redis call without added value.

## Risks / Trade-offs

- **[Risk] `PaymentTimeoutCron` processes payments that were just created** → Mitigation: The Drizzle query selects payments where `timeout_at < NOW()` — a freshly created payment has `timeout_at = NOW() + 15 min`, so it won't match. The `expirePayment` method is also idempotent for already-terminal payments.
- **[Risk] Redis reconciliation check picks up stale counter after registration burst** → Mitigation: Not a risk — a discrepancy of 1-2 seats is expected during concurrent registrations. The threshold of 5 prevents false positives.
- **[Risk] Circuit breaker recovery races with active payment request** → Mitigation: The `checkAndAllow()` in `CircuitBreakerMechanic` also performs the OPEN→HALF_OPEN transition inline. If the cron transitions a circuit to HALF_OPEN, a concurrent canary request may succeed or fail — the circuit transitions correctly in both cases (`recordSuccess` → CLOSED, `recordFailure` → OPEN).
- **[Trade-off] No persistent cron run metadata** → The status endpoints return `last_run` and `next_run` computed in-memory (`new Date()` and `new Date(now + interval)`). This is truthful enough for admin visibility but does not survive server restarts. A `cron_runs` table would add schema migration overhead for marginal debugging benefit at this stage.
