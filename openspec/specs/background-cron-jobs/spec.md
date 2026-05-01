# Background Cron Jobs

Specification for the F10 background cron jobs — payment timeout expiry, seat counter reconciliation monitoring, circuit breaker auto-recovery, and system admin monitoring endpoints.

## ADDED Requirements

### Requirement: Payment timeout cron expires overdue payments

The system SHALL run a scheduled job every 1 minute that identifies all payments with status PENDING and `timeout_at < NOW()`. For each such payment, the system SHALL call `PaymentsService.expirePayment()` to atomically transition the payment to TIMEOUT, cancel the registration, release the seat lock, and increment the available seat counter. The cron SHALL log the count of processed payments and SHALL NOT crash on individual payment failures.

**Source:** FR-F10-001, BR-039
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Overdue payment is expired

- **WHEN** the payment timeout cron runs and finds a PENDING payment where `timeout_at < NOW()`
- **THEN** `PaymentsService.expirePayment()` is called, the payment becomes TIMEOUT, the registration becomes CANCELLED, the seat lock is released, and the available seat counter is incremented

#### Scenario: No overdue payments — no-op

- **WHEN** the payment timeout cron runs and there are no PENDING payments past their timeout
- **THEN** the cron completes without performing any mutations

#### Scenario: Individual expirePayment failure is isolated

- **WHEN** `PaymentsService.expirePayment()` fails for one payment in a batch
- **THEN** the error is logged and the cron continues processing remaining payments

### Requirement: Reconciliation cron detects seat counter drift

The system SHALL run a scheduled job every 10 minutes that compares the Redis `seat:available:{workshopId}` counter against the DB expected value (`workshop.capacity - workshopSlots.confirmedCount - workshopSlots.lockedCount`) for every PUBLISHED workshop. If the absolute difference exceeds 5, the system SHALL log a warning with the discrepancy details. The system SHALL NOT auto-fix discrepancies.

**Source:** FR-F10-002, BR-038
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Seat counters match — no alert

- **WHEN** the reconciliation cron runs and all Redis counters match their DB expected values within threshold
- **THEN** the cron logs a summary with zero discrepancies

#### Scenario: Significant drift detected — warning logged

- **WHEN** a Redis counter differs from its DB expected value by more than 5
- **THEN** a warning is logged with the workshop ID, Redis value, expected value, and discrepancy size

#### Scenario: Workshop not PUBLISHED — skipped

- **WHEN** a workshop is in DRAFT, CANCELLED, or COMPLETED status
- **THEN** that workshop is excluded from the reconciliation check

### Requirement: Circuit breaker recovery cron auto-transitions OPEN to HALF_OPEN

The system SHALL run a scheduled job every 30 seconds that checks all known payment gateways (VNPAY, MOMO, STRIPE). For any gateway whose circuit breaker state is OPEN and where the elapsed time since `opened_at` is >= 30 seconds, the system SHALL transition the state to HALF_OPEN and log the transition.

**Source:** FR-F05-002 (recovery path)
**Priority:** SHOULD
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: OPEN circuit past cooldown — recovered

- **WHEN** the circuit breaker recovery cron runs and finds a gateway with state OPEN and `(now - opened_at) >= 30 seconds`
- **THEN** the state is transitioned to HALF_OPEN and a log entry records the transition

#### Scenario: OPEN circuit within cooldown — no action

- **WHEN** the circuit breaker recovery cron runs and finds a gateway with state OPEN but `(now - opened_at) < 30 seconds`
- **THEN** no transition is made

#### Scenario: Circuit is CLOSED or HALF_OPEN — no action

- **WHEN** the circuit breaker recovery cron runs and the gateway is in CLOSED or HALF_OPEN state
- **THEN** no transition is made

### Requirement: System admin can query cron job status

The system SHALL expose ORGANIZER-protected admin endpoints for monitoring background job status. `GET /admin/system/jobs/payment-timeout` SHALL return the count of PENDING payments, overdue payments, and last/next run timestamps. `GET /admin/system/jobs/reconciliation` SHALL return total PUBLISHED workshops checked, discrepancies found, and last/next run timestamps.

**Source:** FR-F10-003
**Priority:** SHOULD
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

#### Scenario: Admin views payment timeout job status

- **WHEN** an ORGANIZER requests `GET /admin/system/jobs/payment-timeout`
- **THEN** the response includes `pending_count`, `timeout_count`, `last_run`, `next_run`, and `job_status`

#### Scenario: Non-ORGANIZER is rejected

- **WHEN** a STUDENT or CHECKIN_STAFF requests any `/admin/system/` endpoint
- **THEN** the request is rejected with 403 FORBIDDEN

### Requirement: System admin can view and reset circuit breakers

The system SHALL expose ORGANIZER-protected endpoints for circuit breaker management. `GET /admin/system/circuit-breaker` SHALL return the state, failure count, and timestamps for all known gateways. `POST /admin/system/circuit-breaker/:gateway/reset` SHALL force-reset a gateway's circuit breaker to CLOSED with zero failures, after validating that the gateway is one of VNPAY, MOMO, or STRIPE.

**Source:** FR-F10-004
**Priority:** SHOULD
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

#### Scenario: Admin lists all circuit breaker states

- **WHEN** an ORGANIZER requests `GET /admin/system/circuit-breaker`
- **THEN** the response includes an array of circuit breaker statuses for VNPAY, MOMO, and STRIPE with their current state, failure count, and timestamps

#### Scenario: Admin resets a circuit breaker

- **WHEN** an ORGANIZER requests `POST /admin/system/circuit-breaker/VNPAY/reset`
- **THEN** the circuit breaker state becomes CLOSED with failure_count = 0

#### Scenario: Invalid gateway reset rejected

- **WHEN** an ORGANIZER requests `POST /admin/system/circuit-breaker/INVALID/reset`
- **THEN** the request fails with an error indicating the gateway is not recognized
