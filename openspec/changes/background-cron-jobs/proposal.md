## Why

The Background module currently has stub implementations for all cron jobs and system monitoring endpoints. Without these, overdue PENDING payments never expire (leaking seats permanently), Redis seat counters can drift undetected from PostgreSQL, and OPEN circuit breakers never auto-recover — all production-incidents-in-waiting. This change implements the three cron jobs and the system monitoring service that provide the automated safety net for the payment and booking lifecycle (F10).

## What Changes

- Implement `PaymentTimeoutCron` — runs every 1 minute, queries PENDING payments past `timeout_at`, calls `PaymentsService.expirePayment()` for each with error isolation
- Implement `ReconciliationCron` — runs every 10 minutes, compares Redis `seat:available:{workshopId}` against DB expected values for all PUBLISHED workshops, logs warnings for discrepancies > 5 (no auto-fix)
- Create `CircuitBreakerRecoveryCron` (new file) — runs every 30 seconds, transitions OPEN circuit breakers past their 30s cooldown to HALF_OPEN for all 3 known gateways (VNPAY, MOMO, STRIPE)
- Implement `SystemMonitorService` — 4 methods: payment timeout job status, reconciliation status, circuit breaker status, and circuit breaker reset
- Wire `SystemAdminController` — 4 ORGANIZER-protected admin endpoints with proper DTO types
- Update `BackgroundModule` — add new cron to providers, import `BookingModule` for `PaymentsService` injection

## Capabilities

### New Capabilities
- `background-cron-jobs`: Complete F10 background cron jobs — payment timeout expiry, seat counter reconciliation monitoring, circuit breaker auto-recovery, and system admin monitoring endpoints

### Modified Capabilities
<!-- None — all changes are within the existing background module -->

## Impact

- **Affected code**: 6 files in `apps/server/src/modules/background/` (3 cron jobs, 1 service, 1 controller, 1 module wiring)
- **Affected specs**: New `specs/background-cron-jobs/spec.md` covering FR-F10-001 through FR-F10-004, FR-F05-002 auto-recovery
- **Dependencies**: Requires W2 `PaymentsService.expirePayment()` (already merged in booking module)
- **Breaking changes**: None — all endpoints and cron jobs are stubs being filled in
- **External systems**: None — all state managed through Redis and PostgreSQL
