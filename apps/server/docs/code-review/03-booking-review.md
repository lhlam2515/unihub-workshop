# Booking Module Code Review

> **Scope:** `apps/server/src/modules/booking/` (19 production files)
> **Reviewers:** NestJS Compliance Analysis + Code Quality Specialist
> **Date:** 2026-05-02

---

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| NF1 | Query parameters not validated via Zod DTO — `getMyPayments` uses anonymous inline type with no validation pipe | NestJS requires validated DTOs for all inputs; raw types bypass ZodValidationPipe | `controllers/payments.controller.ts:115` | **High** | Extract a `GetPaymentsQueryDto` using `createZodDto` with `z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() })` |
| NF2 | Query parameters manually parsed from strings in `getMyRegistrations` — `page ? Number(page) : undefined` | Controller should not do manual type coercion | `controllers/registrations.controller.ts:70-73` | **High** | Use a Zod-validated query DTO with `z.coerce.number()` |
| NF3 | `status` query param in `getMyRegistrations` is `string` with no enum validation | No validation on an enum-constrained domain value | `controllers/registrations.controller.ts:66` | **Medium** | Define `RegistrationStatusSchema = z.enum(["CONFIRMED","PENDING_PAYMENT","CANCELLED"]).optional()` in a query DTO |
| NF4 | Controllers return `Result` directly (handled by global `ResponseInterceptor`) | ✅ Compliant — correct Interceptor pattern | Both controllers | — | N/A |
| NF5 | Class-level `@UseGuards(JwtAuthGuard, RolesGuard)` correctly applied to both controllers | ✅ Compliant | Both controllers:45,24 | — | N/A |
| NF6 | Webhook endpoint correctly uses `@Public()` + `@UseGuards(HmacSignatureGuard)` to selectively override class-level guards | ✅ Compliant | `controllers/payments.controller.ts:92-93` | — | N/A |
| NF7 | `@IdempotencyKey()` custom decorator extracts header — correct NestJS decorator pattern | ✅ Compliant | `controllers/payments.controller.ts:71` | — | N/A |
| NF8 | `@CurrentUser()` used consistently — IDOR can't come from request body | ✅ Compliant | Both controllers | — | N/A |
| NF9 | Booking module uses correct `@Module()` decorator with proper imports, controllers, providers, exports | ✅ Compliant | `booking.module.ts:44-64` | — | N/A |
| NF10 | Cross-module imports correct: `DatabaseModule`, `RedisModule`, `CatalogModule`, `SharedQueueModule` | ✅ Compliant | `booking.module.ts:45` | — | N/A |
| NF11 | Rate limiting done in-service rather than as NestJS `@UseGuards()` Guards | Diverges from NestJS guard lifecycle; Guards run before pipes/controllers | `services/registrations.service.ts:86-91` | **Info** | Consider extracting rate limits into `@UseGuards(RateLimitGuard)` for earlier rejection |
| NF12 | GlobalExceptionFilter catches all exceptions | ✅ Compliant | Global | — | N/A |

### 1.2 Techniques

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| NT1 | DTOs correctly use `createZodDto` from `nestjs-zod` for request bodies | ✅ Compliant | All `dto/*.dto.ts` | — | N/A |
| NT2 | `PaymentResponseBuilder.payment` typed as `any` | Weakens type safety | `dto/registration-response.dto.ts:31` | **Medium** | Import `Payment` type from `@/database/types/transaction.types` |
| NT3 | `raw_response` in `PaymentWebhookSchema` typed as `z.any()` | Overly permissive | `dto/payment-webhook.dto.ts:15` | **Medium** | Narrow to `z.record(z.unknown())` or a defined interface |
| NT4 | `tx: any` used in repository methods for transaction context | Loses type safety on Drizzle transaction client | `repositories/payments.repository.ts:87,119,199,217`, `registrations.repository.ts:96-98,241-243` | **Medium** | Define a typed `DrizzleTx` type alias in database module |
| NT5 | BullMQ `@InjectQueue(NOTIFICATION_QUEUE)` correctly injected | ✅ Compliant | Both service files | — | N/A |
| NT6 | BullMQ job names are plain strings (`"registration.confirmed"`, `"payment.success"`, etc.) | Prone to typos; no autocomplete | Both service files | **Low** | Extract to shared constants/enum |
| NT7 | `hGetAll` response cast as `unknown as TokenBucket` | Unsafe type assertion | `mechanics/rate-limiter.mechanic.ts:56` | **Low** | Use Zod schema to validate Redis hash response at runtime |
| NT8 | Repositories use `tryCatch` with `systemErrors.internal` consistently | ✅ Compliant | All repository files | — | N/A |
| NT9 | Drizzle transaction support with pessimistic locking (`FOR UPDATE NOWAIT`) | ✅ Compliant | `repositories/payments.repository.ts:217-255` | — | N/A |
| NT10 | Mechanics correctly encapsulate Redis operations (seat-lock, circuit-breaker, rate-limiter, idempotency) | ✅ Compliant | All mechanics files | — | N/A |

### 1.3 Security

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| NS1 | JWT secret accessed via `process.env.JWT_SECRET!` | Bypasses NestJS ConfigService; unsafe `!` assertion | `services/payments.service.ts:374`, `services/registrations.service.ts:165` | **High** | Inject `ConfigService` via `this.configService.get<string>('JWT_SECRET')` |
| NS2 | `jwt.sign()` called in PaymentsService and RegistrationsService for QR tokens | Token signing should be centralized in IAM module; violates SoC | `services/payments.service.ts:368-376`, `services/registrations.service.ts:159-167` | **Medium** | Create a dedicated `QrTokenService` in IAM module |
| NS3 | IDOR correctly enforced: student_id always from `@CurrentUser()` | ✅ Compliant | Both services | — | N/A |
| NS4 | 404 returned for both missing and non-owned resources | ✅ Compliant | Both services | — | N/A |
| NS5 | Webhook endpoint uses HMAC signature guard | ✅ Compliant | `controllers/payments.controller.ts:93` | — | N/A |
| NS6 | Rate limiting not applied to payment endpoints | Payment endpoints unguarded at rate-limit level | `controllers/payments.controller.ts` | **Low** | Consider adding per-user rate limiting on payment initiation |
| NS7 | `PaymentsController.getMyPayments` has class-level `@Roles("STUDENT")` | ✅ Compliant | — | — | N/A |

---

## 2. Code Quality Principles

### 2.1 KISS (Keep It Simple, Stupid)

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| K1 | `initiate` method: 102 lines, 8 pipeline stages, high cyclomatic complexity with nested transaction callbacks | `services/payments.service.ts:122-223` | **Medium** | Extract stages 1 and 2-4 into private methods with descriptive names |
| K2 | `handleWebhook` method: 125 lines with ACID transaction, success/failure branches, post-transaction Redis ops, JWT signing, event emission | `services/payments.service.ts:270-395` | **Medium** | Extract success-path and failure-path into private methods |
| K3 | `register` method: 115 lines, 8 stages, scattered rollback logic (seat counter re-increment at 3 locations) | `services/registrations.service.ts:79-194` | **Medium** | Consolidate compensating rollback into a single private method |
| K4 | `bucket as unknown as TokenBucket` double assertion bypasses type safety | `mechanics/rate-limiter.mechanic.ts:56` | **Low** | Add runtime validation with Zod schema or restructure |

### 2.2 YAGNI (You Aren't Gonna Need It)

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| Y1 | Placeholder `case "VNPAY": case "STRIPE": case "MOMO":` all fall through to `default` with identical behavior | `services/payment-gateway.service.ts:66-72,97-101` | **High** | Remove the three placeholder cases; `default` already handles unsupported gateways |
| Y2 | `verifyHmacSignature` method is a stub — HMAC verified by `HmacSignatureGuard`; method accepts unused params, returns `true` for MOCK only | `services/payment-gateway.service.ts:89-103` | **Medium** | Remove the method entirely, or simplify to `return Result.ok(gateway === "MOCK")` |
| Y3 | `_tx?: any` parameters on `create` and `cancelAllForWorkshop` in repository — never used | `repositories/registrations.repository.ts:96-98,241-243` | **Medium** | Remove unused `_tx` parameters; add back when transaction support is needed |
| Y4 | `_gateway: string` parameter in `handleWebhook` — never used | `services/payments.service.ts:271` | **Medium** | Remove the `gateway` parameter and update controller |
| Y5 | `// TODO: Log warning` comment in production code — unresolved action item | `services/registrations.service.ts:173` | **Low** | Implement the logging or remove the TODO |

### 2.3 DRY (Don't Repeat Yourself)

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| D1 | JWT signing logic duplicated verbatim in both services — identical payload `{ ticket_id, workshop_id, student_id }`, same secret, same 30d expiry | `services/payments.service.ts:368-376`, `services/registrations.service.ts:159-167` | **High** | Extract to shared `QrTokenService` |
| D2 | Fire-and-forget queue pattern `this.notificationQueue.add(...).catch(() => {})` repeated 3 times with same comment | Both service files | **Medium** | Create shared helper `enqueueFireAndForget(queue, eventType, data)` in queue module |
| D3 | IDOR ownership check pattern not extracted in PaymentsService (done inline); RegistrationsService has `findByIdWithOwnershipCheck` | `services/payments.service.ts:451-456` vs `services/registrations.service.ts:396-406` | **Low** | Add private `findByIdWithOwnershipCheck` to PaymentsService |

### 2.4 SOLID

| # | Finding | Principle | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| S1 | PaymentsService handles 5+ concerns: payment pipeline, webhooks, queries, JWT signing, event emission, seat locks | **SRP** | `services/payments.service.ts` | **High** | Extract JWT signing to shared `QrTokenService`; extract event emission to `NotificationService` |
| S2 | RegistrationsService mixes registration orchestration with JWT signing, ticket creation, event emission | **SRP** | `services/registrations.service.ts` | **High** | Same as S1 — delegate JWT signing and event emission |
| S3 | Direct BullMQ `Queue` injection instead of abstraction — couples domain to specific queue implementation | **DIP** | `services/payments.service.ts:81`, `services/registrations.service.ts:37` | **Medium** | Define `NotificationService` interface in `src/shared/queues/` |
| S4 | Repository `tx?: any` instead of typed transaction context | **DIP** | All repositories | **Low** | Define `DrizzleTx` type alias in database module |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| C1 | QR token JWT signing in domain services — infrastructure concern mixed with business logic | `services/payments.service.ts:368-376`, `services/registrations.service.ts:159-167` | **High** | Create `QrTokenService` or expand IAM module |
| C2 | `RegistrationWithDetailsDto.payment?: any` bypasses type safety; `workshop!` non-null assertion unsafe | `dto/registration-response.dto.ts:31,96` | **Medium** | Type `payment` properly; make `workshop` required or guard |
| C3 | Empty-string fallback for `workshopId` on webhook failure path — masks data integrity issues | `services/payments.service.ts:337` | **Medium** | Fail explicitly if registration not found instead of propagating empty string |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| L1 | `payment.timeoutAt!` non-null assertion on potentially nullable field | `services/payments.service.ts:220` | **Medium** | Add runtime guard: `if (!payment.timeoutAt) return Result.fail(...)` |
| L2 | Result pattern chaining (`workshopResult.data.price`, `regUpdate.data.workshopId`) is inherent to pattern | All service files | **Info** | Accept as consequence of Result pattern — consistent with project conventions |

### 2.7 Correctness

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| E1 | `RegistrationsService.countConfirmedByWorkshop` calls `this.registrationsRepo.countConfirmedByWorkshop(workshopId)` but this method does **not exist** in `RegistrationsRepository` — **compilation error** | `services/registrations.service.ts:393` | **Critical** | Add the missing method to `RegistrationsRepository` |
| E2 | SeatLockMechanic `acquire` method builds payload with `studentId` but ignores `amount` parameter | `mechanics/seat-lock.mechanic.ts:47-68` | **Low** | Either include amount in payload or remove the parameter |

---

## 3. Strategic Recommendations

### 3.1 Immediate Fixes (Critical)

| Priority | Finding | Action |
|----------|---------|--------|
| **P0** | `countConfirmedByWorkshop` method missing from `RegistrationsRepository` | Add the method — causes compilation failure. Called from `reconciliation.cron.ts` line 123. |
| **P0** | `process.env.JWT_SECRET!` in two services | Replace with `ConfigService` injection — no env validation at startup, unsafe `!` assertion. |

### 3.2 Short-Term Improvements (High)

| Priority | Finding | Action |
|----------|---------|--------|
| P1 | Query params bypass Zod validation (NF1, NF2) | Add Zod query DTOs for paginated endpoints |
| P1 | JWT signing duplicated (D1, C1, NS2) | Extract `QrTokenService` to eliminate 2 duplication sites and SRP violation |
| P1 | Placeholder gateway cases (Y1) | Clean up `payment-gateway.service.ts` — remove VNPAY/STRIPE/MOMO placeholder cases |
| P2 | Long methods (K1, K2, K3) | Extract private helper methods from `initiate`, `handleWebhook`, `register` |
| P2 | `any` types in DTOs (NT2, NT3, C2) | Replace with proper types from database types |

### 3.3 Medium-Term Improvements

| Priority | Finding | Action |
|----------|---------|--------|
| P3 | `tx: any` in repositories (NT4) | Add typed `DrizzleTx` to database module |
| P3 | Direct BullMQ queue injection (S3) | Add `NotificationService` interface abstraction |
| P3 | Fire-and-forget pattern duplicated (D2) | Extract to shared helper in queue module |
| P3 | Unused `_gateway` param in `handleWebhook` (Y4) | Remove parameter |
| P3 | Unused `_tx` params in repository (Y3) | Remove from `create` and `cancelAllForWorkshop` |
| P4 | Rate limiting in-service vs guard (NF11) | Consider extracting to `@UseGuards(RateLimitGuard)` |
| P4 | BullMQ job name strings (NT6) | Extract to constants/enum |
| P4 | TODO in production code (Y5) | Implement logging or remove |
| P4 | SeatLockMechanic unused `amount` param (E2) | Either use or remove |

### 3.4 Long-Term Architecture

| Area | Recommendation |
|------|---------------|
| **IAM centralization** | Move all JWT/token operations (signing, verification, refresh) exclusively to the IAM module. Services should never import `jsonwebtoken` directly. |
| **Queue abstraction** | Introduce a lightweight `NotificationPort` interface so domain services depend on an abstraction rather than BullMQ `Queue` directly. |
| **Config validation** | Use `@nestjs/config` with a validated `ConfigSchema` (Zod) to ensure all env vars are present and typed at startup. |
| **Rate limiting as middleware** | Consider implementing rate limiting as a reusable NestJS Guard (compatible with `@nestjs/throttler` or custom) rather than in-service procedural checks. |

---

## Finding Summary

| Category | Critical | High | Medium | Low | Info | Total |
|----------|----------|------|--------|-----|------|-------|
| NestJS Compliance | 0 | 3 | 5 | 3 | 2 | 13 |
| Code Quality | 1 | 6 | 12 | 5 | 1 | 25 |
| **Total** | **1** | **9** | **17** | **8** | **3** | **38** |

### Key Strengths

- ✅ Well-structured Result pattern with clean `ResponseInterceptor` — services never throw
- ✅ Excellent Mechanic pattern for Redis operations (seat-lock, circuit-breaker, idempotency, rate-limiter)
- ✅ Consistent IDOR enforcement via `@CurrentUser()` — no student ID from request body
- ✅ ACID transactions with pessimistic locking for payment webhook serialization
- ✅ Thorough Contract-Oriented JSDoc across all files (business rules, side effects, error codes documented)
- ✅ Clean module boundaries — proper imports and exports via `@Module()`

### Key Weaknesses

- ❌ **1 compilation error**: `countConfirmedByWorkshop` missing from repository (P0)
- ❌ **JWT secret access**: `process.env.JWT_SECRET!` bypasses NestJS config (P0)
- ❌ **JWT signing in domain services**: Duplicated across 2 services, violates SRP + SoC + DRY
- ❌ **Query params bypass Zod validation**: Manual string parsing in controllers
- ❌ **Placeholder code**: YAGNI violations in payment-gateway service
- ❌ **Long methods**: 3 service methods over 100 lines with high cyclomatic complexity
- ❌ **`any` types proliferating**: DTOs, transaction contexts, Redis responses lack proper types
