# Proposal: Implement Registration Flow

## Summary

Implement the workshop registration flow (F04 module) with all accompanying load control mechanics as specified in `docs/srs.md`. The booking module scaffolding (18 files) already exists with TODO stubs — this change completes every stub related to registration, including the three mechanics (Rate Limiter, Global Rate Limit, Seat Lock) that form the critical-path defense against traffic surges.

## Motivation

- The `booking` module has full scaffolding but **zero implemented methods** — all services, repositories, mechanics, and controllers are TODO stubs.
- The SRS defines 6 functional requirements (FR-F04-001 through FR-F04-006) with precise acceptance criteria and 8 business rules (BR-006, BR-016–BR-023).
- Infrastructure is ready: DB schemas, Redis primitives, SeatCounterService, error factories, and the Result pattern are all implemented.
- Without the registration flow, the system cannot accept workshop signups — the primary user-facing feature.

## Scope

**In scope (F04 — Registration & Seat Management):**

| FR | Feature | Priority |
|----|---------|----------|
| FR-F04-001 | Token Bucket rate limit per user (5 tokens, 1/10s refill) | MUST |
| FR-F04-002 | Atomic DECR on `seat:available:{wid}` with rollback | MUST |
| FR-F04-003 | Create registration for free workshop → CONFIRMED + Ticket | MUST |
| FR-F04-004 | Create registration for paid workshop → PENDING_PAYMENT + SeatLock | MUST |
| FR-F04-005 | Cancel registration → CANCELLED + VOID ticket + INCR seat | MUST |
| FR-F04-006 | View registration history with IDOR protection | MUST |

**Intentionally excluded (separate changes):**
- F05 Payment Processing (payment gateway calls, webhooks, circuit breaker)
- F06 Ticket & QR Code (ticket issuance and QR validation — referenced but not implemented here)
- F10 Background Jobs (payment timeout reconciliation)

## Approach

1. **Bottom-up implementation:** Mechanics → Repository → Service → Controller → Response DTOs
2. **Mechanics first** (RateLimiter, GlobalRateLimit, SeatLock) because they're the load-control foundation that the service orchestrates
3. **No new database migrations** — the `registrations` and `tickets` tables already exist
4. **Ticket issuance is stubbed** — we insert a ticket row with a placeholder QR token; full QR generation is deferred to F06
5. **All services return `Result<T, AppError>`** — never throw

## Success Criteria

- [ ] All 6 FRs pass their acceptance criteria from the SRS
- [ ] `pnpm build` passes for the server
- [ ] `pnpm lint` passes for the server
- [ ] `pnpm check-types` passes for the server
- [ ] Redis mechanics work atomically (no race conditions)
- [ ] IDOR protection enforced on all student endpoints
