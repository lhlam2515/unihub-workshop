## Context

The booking module currently has stub implementations for all 7 payment-related files. W1 (Queue Infrastructure) provided `SharedQueueModule` with BullMQ and `PaymentEventData` contract. The database schema for `payments`, `registrations`, and `tickets` is fully defined with proper constraints. Error factories (`paymentErrors`) cover all 6 error codes. What's missing is the complete implementation of the payment lifecycle.

This change implements F05 — the most safety-critical module in UniHub. It must handle concurrent payment requests without double-charging, withstand payment gateway outages via circuit breaker, and process webhooks in ACID transactions.

## Goals / Non-Goals

**Goals:**
- Implement 2-layer idempotency (Redis SET NX + PostgreSQL UNIQUE constraint) per ADR-08
- Implement Circuit Breaker state machine (CLOSED→OPEN→HALF_OPEN) on Redis Hash per ADR-10
- Implement payment initiation multi-stage pipeline with seat lock verification and pessimistic locking
- Implement webhook processing in ACID transaction (payment→registration→ticket) per BR-027
- Implement `expirePayment()` contract for W4 background cron
- Wire all 4 controller endpoints with proper types, Zod validation, and guards
- Fire `PaymentEventData` events via BullMQ for notification dispatch

**Non-Goals:**
- Real VNPAY/STRIPE/MOMO adapters (MOCK only for MVP)
- Refund processing (out of scope per GAP-01 resolution)
- HMAC verification logic (HmacSignatureGuard already implemented)
- Notification dispatch (W3 scope)

## Decisions

### D1: Multi-stage pipeline with compensating actions

Following the `RegistrationsService.register()` pattern, `initiate()` uses a sequential pipeline where each stage returns `Result<T, AppError>`. Failures short-circuit immediately. No compensating actions needed because:
- Idempotency check fails before any DB write
- Circuit breaker fails before any DB write  
- Seat lock check fails before payment INSERT
- Only the payment INSERT and gateway call are fallible after checks pass — and the gateway call is fire-and-forget

**Alternative considered**: Parallel checks like `register()` Stage 1-3. Rejected because idempotency MUST be checked before the circuit breaker (to avoid counting duplicate requests as gateway failures), and seat lock check SHOULD happen after idempotency (to avoid unnecessary Redis reads on duplicate requests).

### D2: Repository uses `FOR UPDATE NOWAIT` not `FOR UPDATE`

Per BR-028 and ADR-06, the payment INSERT acquires a pessimistic lock on `workshop_slots` with `NOWAIT` — if the row is locked, PostgreSQL raises immediately instead of queuing. Combined with `statement_timeout = '3s'`, this enforces Fail-Fast: the request fails in <3s rather than hanging.

**Alternative considered**: `FOR UPDATE SKIP LOCKED`. Rejected because `SKIP LOCKED` silently skips rows, which is appropriate for job queues but NOT for payment — we need to know whether the lock succeeded.

### D3: MOCK gateway with switch structure

`PaymentGatewayService` implements a switch on `gateway` parameter with a `MOCK` branch that simulates 1-2s delay and returns a fake redirect URL. The structure has empty cases for VNPAY, STRIPE, and MOMO — ready for real adapters without refactoring.

**Alternative considered**: Strategy pattern with injected adapters. Rejected as over-engineering for MVP — the switch is sufficient when there are only 4 gateways and 2 methods each. Strategy pattern is better for runtime plugin registration, which isn't needed yet.

### D4: Webhook verifies HMAC before touching data

`HmacSignatureGuard` runs before the controller method, ensuring only authenticated gateway requests reach `handleWebhook()`. The service does NOT re-verify — guard failure returns 401 before any business logic executes.

### D5: Event emission is fire-and-forget

After the ACID transaction commits, `notificationQueue.add()` is called without awaiting the result. This follows ADR-11 — the payment flow must not be blocked by notification dispatch latency.

## Risks / Trade-offs

- **[Risk] Redis crash between idempotency check and payment INSERT** → Mitigation: Layer 2 DB UNIQUE constraint is the ultimate gate. If Redis is down, `SET NX` fails but the payment still proceeds (the idempotency mechanic returns `proceed: true` on Redis error, with the DB constraint as fallback). This is a deliberate trade-off: availability over strict Redis-gated idempotency.
- **[Risk] Webhook processed twice concurrently** → Mitigation: The `SELECT ... FOR UPDATE NOWAIT` on the payment row in `handleWebhook()` serializes concurrent webhooks. The second caller gets `DB_LOCK_TIMEOUT` and retries — on retry it finds `PAYMENT_ALREADY_SUCCESS`.
- **[Risk] Ticket creation fails inside ACID transaction** → Mitigation: The entire transaction rolls back (payment stays PENDING, registration stays PENDING_PAYMENT). The gateway already processed payment, but the webhook can safely retry. The ticket INSERT has a UNIQUE constraint on `registration_id` making retries idempotent.
- **[Trade-off] MOCK gateway always succeeds** → Real gateways have failure modes (timeout, 5xx, invalid signature). The circuit breaker logic is fully implemented and testable, but the MOCK adapter bypasses actual HTTP calls. Real adapter testing is deferred.
