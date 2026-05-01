## Why

Payment processing is the highest-risk subsystem in UniHub Workshop — a single defect can cause double-charging students or issuing tickets without confirmed payment. Currently all 7 files in the booking module's payment path are stubs (returning `void`, `any`, or empty defaults), making paid workshops unusable. W1 (Queue Infrastructure) is merged, so the BullMQ foundation is ready. This change implements the complete F05 module to unblock paid workshop registration and W4 (Background Cron Jobs).

## What Changes

- Implement `IdempotencyMechanic` — 2-layer idempotency (Redis SET NX Layer 1 + DB UNIQUE Layer 2) to prevent double-charging
- Implement `CircuitBreakerMechanic` — CLOSED→OPEN→HALF_OPEN state machine via Redis Hash for payment gateway resilience
- Implement `PaymentsRepository` — 5 methods with pessimistic locking (`FOR UPDATE NOWAIT`, 3s timeout) and `tryCatch` wrapper
- Implement `PaymentGatewayService` — MOCK adapter with switch structure ready for VNPAY/STRIPE/MOMO real adapters
- Implement `PaymentsService` — core orchestration: `initiate()` multi-stage pipeline + `handleWebhook()` ACID transaction + `expirePayment()` contract for W4
- Implement `PaymentResponseDto` — `from()` and `fromCreate()` factory methods stripping internal DB fields
- Wire `PaymentsController` — 4 endpoints with proper DI types, Zod validation, and guard configuration
- Add `SharedQueueModule` import to `BookingModule` for payment event emission via BullMQ

## Capabilities

### New Capabilities
- `payment-processing`: Complete F05 payment workflow — idempotency, circuit breaker, payment initiation, webhook processing with ACID transaction, ticket issuance, and event emission

### Modified Capabilities
<!-- None — all payment functionality is entirely new; existing registration lifecycle spec is unchanged -->

## Impact

- **Affected code**: 7 files in `apps/server/src/modules/booking/` (mechanics, repositories, services, controllers, dto), 1 module file (`booking.module.ts`)
- **Affected specs**: New `specs/payment-processing/spec.md` covering FR-F05-001 through FR-F05-005
- **Dependencies**: Requires W1 `SharedQueueModule` (already merged); depended on by W4 `PaymentTimeoutCron`
- **Breaking changes**: None — all endpoints and DTOs already exist as stubs with correct shapes
- **External systems**: None (MOCK payment gateway for MVP)
