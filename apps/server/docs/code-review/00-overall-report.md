# Overall Server Code Review Report

**Date:** 2026-05-02
**Scope:** `apps/server/` — all 5 modules + platform infrastructure
**Reviewers:** 6 specialized agents + 3 Pass 2 cross-reviewers (IAM, Catalog, Booking, Checkin, Background, Platform)
**Methodology:** Pass 1 (manual review) + Pass 2 (NestJS official docs cross-reference + code-review-specialist subagent) for IAM, Checkin, Platform

---

## Executive Summary

| Metric | Pass 1 | Pass 2 Additions | **Grand Total** |
|--------|--------|-----------------|-----------------|
| **Total Findings** | 140 | +43 | **183** |
| Critical | 10 | +5 | **15** |
| High | 28 | +4 | **32** |
| Medium | 56 | +15 | **71** |
| Low | 43 | +19 | **62** |
| Info | 3 | — | 3 |
| **Files Reviewed** | ~110 production `.ts` files |
| **Modules Audited** | 6 (IAM, Catalog, Booking, Checkin, Background, Platform) |

### Findings by Module

| Module | Critical | High | Medium | Low | Total | Pass 1 → Final |
|--------|----------|------|--------|-----|-------|-----------------|
| IAM | 5 | 6 | 12 | 15 | **38** | 24 → 38 (+14) |
| Catalog | 2 | 2 | 8 | 8 | **20** | 20 (no Pass 2 needed) |
| Booking | 1 | 9 | 17 | 8 | **38** | 38 (no Pass 2 needed) |
| Checkin | 2 | 3 | 7 | 6 | **18** | 5 → 18 (+13) |
| Background | 3 | 8 | 10 | 7 | **28** | 28 (no Pass 2 needed) |
| Platform | 2 | 4 | 17 | 18 | **41** | 25 → 41 (+16) |
| **Total** | **15** | **32** | **71** | **62** | **183** | 140 → 183 |

### Pass 2 Impact Summary

Three modules (IAM, Checkin, Platform) received a second pass with NestJS docs cross-reference and code-review-specialist subagent evaluation. The cross-reviewers (catalog-reviewer → IAM, background-reviewer → Checkin, booking-reviewer → Platform) brought fresh eyes from different modules.

| Module | Pass 1 | Pass 2 | New Critical | Key New Finding |
|--------|--------|--------|-------------|-----------------|
| IAM | 24 | +14 | 2 | `refreshToken()` hardcodes WEB-only expiry; `updateUserStatus` blacklists admin instead of target user |
| Checkin | 5 | +13 | 1 | `countConfirmedRegistrationsByWorkshopId` missing `WHERE status = 'CONFIRMED'` — wrong statistics |
| Platform | 25 | +16 | 2 | `isPaginatedShape` allows NaN; `IdempotencyKey` can receive `string[]` from duplicate headers |
| Catalog | 20 | — | — | Already included docs+subagent in v1 |
| Booking | 38 | — | — | Already included docs+subagent in v1 |
| Background | 28 | — | — | Already included docs+subagent in v1 |

### Findings by Category (Combined Pass 1 + Pass 2)

| Principle | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| NestJS Compliance | 7 | 11 | 14 | 15 | 47 |
| KISS | 1 | 2 | 9 | 6 | 18 |
| YAGNI | 0 | 4 | 6 | 12 | 22 |
| DRY | 0 | 4 | 11 | 3 | 18 |
| SOLID | 1 | 8 | 11 | 4 | 24 |
| Separation of Concerns | 1 | 4 | 4 | 1 | 10 |
| Law of Demeter | 0 | 0 | 1 | 8 | 9 |
| Correctness | 5 | 0 | 5 | 3 | 13 |
| Type Safety | 0 | 0 | 4 | 4 | 8 |
| Database Schema | 0 | 0 | 3 | 1 | 4 |
| Documentation | 0 | 0 | 1 | 1 | 2 |
| Resource Leak | 0 | 0 | 2 | 0 | 2 |
| Import Hygiene | 0 | 0 | 0 | 2 | 2 |

---

## Top 10 Critical Issues

### 🔴 C1: WEB Refresh Token Flow Is Broken (IAM)
**File:** `iam/controllers/auth.controller.ts:97-104`
The `POST /auth/refresh` endpoint sets an HttpOnly cookie but never reads it. On the WEB platform, `refresh_token` is `undefined` in the body, which falls through to `""`, causing every WEB refresh attempt to fail with `REFRESH_TOKEN_INVALID`. The cookie is write-only — WEB clients cannot refresh tokens without redundantly sending the token in the body.

### 🔴 C2: `revokeUserTokens` Is a No-Op Stub (IAM)
**File:** `iam/services/users.service.ts:116-131`
A security-sensitive method named "revoke all tokens" does nothing except check user existence and return a confirmation message. No token blacklisting, no `tokenVersion` increment, no session invalidation. Administrators who call this endpoint believe tokens are revoked when they are not — a real security risk.

### 🔴 C3: HmacSignatureGuard Uses `JSON.stringify(body)` Instead of Raw Body (IAM)
**File:** `core/guards/hmac-signature.guard.ts:95-98`
Payment gateways sign the raw HTTP body. `JSON.stringify()` on the parsed body can produce different output (key ordering, whitespace, number encoding). All payment webhook signature verifications will silently fail in production.

### 🔴 C4: Missing Method `findPublishedBasic()` in WorkshopsRepository (Catalog)
**File:** `catalog/services/workshops.service.ts:716`
`WorkshopsService.getPublishedWorkshopsBasic()` calls `this.workshopsRepo.findPublishedBasic()` but the method does NOT exist in `WorkshopsRepository`. This will crash at runtime on the first invocation (likely from the reconciliation cron).

### 🔴 C5: `reconcileSlot` Parameter Mapping Corruption (Catalog)
**File:** `catalog/services/workshops.service.ts:740-744` → `catalog/repositories/workshop-slots.repository.ts:151`
The service passes 4 parameters (`workshopId, capacity, lockedCount, confirmedCount`) but the repository's `reconcile()` accepts only 3 (`workshopId, lockedCount, confirmedCount`). This silently maps `capacity` → `lockedCount` and `lockedCount` → `confirmedCount`, corrupting workshop slot data on every reconciliation cron run.

### 🔴 C6: Missing Method `countConfirmedByWorkshop` in RegistrationsRepository (Booking)
**File:** `booking/services/registrations.service.ts:393`
`RegistrationsService.countConfirmedByWorkshop()` calls `this.registrationsRepo.countConfirmedByWorkshop()` but this method does NOT exist in `RegistrationsRepository`. Compilation/runtime error. Called from `reconciliation.cron.ts`.

### 🔴 C7: Direct DB Access Bypassing Repository Layer (Background)
**Files:** `background/services/student-sync.service.ts:353-375`, `background/services/system-monitor.service.ts:58-71,106-138`
Two services call `this.db.insert()` and `this.db.select()` directly instead of using repositories. This is the most severe architectural violation in the codebase — it breaks the layered architecture guarantee (controllers → services → repositories), makes testing impossible, and violates Separation of Concerns.

### 🔴 C8: AiSummaryWorker Bypasses Service Layer (Background)
**File:** `background/workers/ai-summary.worker.ts:42,98-100`
The worker directly injects and calls `AiSummariesRepository`, bypassing `AiSummaryService`. This creates dual update paths to `ai_summaries` status, potentially causing inconsistent state.

### 🔴 C9: `HmacSignatureGuard` Crash Risk on Missing Raw Body (IAM)
**File:** `core/guards/hmac-signature.guard.ts:95-98`
If `request.rawBody` is not configured (requires `express.raw()` middleware with body preservation), the guard will try to sign `undefined`, causing runtime errors on all webhook endpoints. The current `JSON.stringify(request.body)` approach is fundamentally incompatible with how payment gateways compute signatures.

### 🔴 C10: Checkin Scan/Sync Endpoints Unvalidated (Checkin)
**Files:** `checkin/dto/scan-qr.dto.ts`, `checkin/dto/offline-sync.dto.ts`
Request DTOs use plain Zod schemas with `import type` — the Zod schemas are never instantiated at runtime. NestJS `ZodValidationPipe` requires classes extending `createZodDto()`. `POST /checkin/scan` and `POST /checkin/sync` accept completely unvalidated payloads. Invalid UUIDs, missing tokens, or malformed timestamps are silently accepted.

---

## Cross-Cutting Concerns

### Pattern 1: `createZodDto` Not Adopted (IAM + Checkin)
Two modules (IAM: 4 DTOs, Checkin: 2 DTOs) bypass the project's validated input contract by using `z.infer<>` type aliases instead of `createZodDto()` classes. Controllers must manually call `Schema.parse()`, validation errors may not be properly formatted by the global exception filter, and the pattern is inconsistent with Catalog and Booking modules.

**Affected:** `login.dto.ts`, `refresh-token.dto.ts`, `assign-workshops.dto.ts`, `update-user-status.dto.ts`, `scan-qr.dto.ts`, `offline-sync.dto.ts`

### Pattern 2: `process.env` Instead of ConfigService (Platform → All Modules)
Every infrastructure module reads environment variables directly via `process.env` instead of using NestJS `ConfigService`. This couples the entire platform layer to global mutable state, complicates testing, and prevents per-environment config injection. Only `StorageModule` implements the proper `forRoot()` pattern.

**Affected:** `cors.config.ts`, `logger.config.ts`, `redis.service.ts`, `queue.module.ts`, `database.module.ts`, `payments.service.ts`, `registrations.service.ts`

### Pattern 3: JWT Signing Duplicated in Domain Services (Booking + Catalog)
`PaymentsService` and `RegistrationsService` both contain identical JWT signing logic (same payload shape, same secret, same 30-day expiry). QR token generation is an infrastructure concern that should be centralized in the IAM module. Both services import `jsonwebtoken` directly.

### Pattern 4: Missing Repository Methods (Catalog + Booking)
Three repository methods are called from services but never implemented: `WorkshopsRepository.findPublishedBasic()`, `WorkshopSlotsRepository.reconcile()` (parameter mismatch), and `RegistrationsRepository.countConfirmedByWorkshop()`. This suggests the services were written before the repositories were completed, or the methods were removed during refactoring without updating callers.

### Pattern 5: Direct DB Access in Services (Background)
`StudentSyncService` and `SystemMonitorService` bypass the repository layer entirely, calling `this.db` directly. This architectural violation undermines the layered architecture and makes these services untestable.

### Pattern 6: Inline Error Objects Instead of Error Factories (IAM + Others)
7+ instances of raw `Result.fail({ category, code, message })` with hardcoded strings instead of using the centralized error factory functions in `shared/response/errors.ts`. This bypasses the error catalog, making error codes harder to audit and inconsistent across modules.

---

## Module-by-Module Summary

### IAM Module (38 findings: 5C/6H/12M/15L) — Pass 1 + Pass 2
**Strengths:** Strong Result pattern adherence, excellent JSDoc coverage, clean repository layer, proper guard chain (JWT → Roles → WorkshopScope), refresh token rotation with Redis blacklisting, minimal module exports.
**Weaknesses (Pass 1):** `createZodDto` not used (architectural deviation), `revokeUserTokens` is a no-op (security risk), WEB refresh flow is broken, `@Res()` in auth controller violates project anti-patterns, inline error objects instead of factories, CHECKIN_STAFF logic duplicated 3×.
**Weaknesses (Pass 2 — new):** `refreshToken()` hardcodes WEB-only 15-min expiry breaking MOBILE refresh (CRITICAL), `updateUserStatus` blacklists admin's token instead of target user's (CRITICAL), JWT verification duplicated across guard and service (HIGH), inconsistent snake_case vs camelCase between login/refresh responses, empty `allowed_workshop_ids` in every JWT, `StudentProfileService` is a no-op pass-through, `WorkshopScopeGuard` misplaced in `core/` instead of module.

### Catalog Module (20 findings: 2C/2H/8M/8L)
**Strengths:** Well-structured controllers (thin, no business logic), proper RBAC on admin endpoints, consistent Zod→DTO pattern, `from()` factory methods on response DTOs, file upload validation with `ParseFilePipe`.
**Weaknesses:** Two critical runtime bugs (missing method, parameter mismatch), dead `aiSummary` parameter with lint suppression, unused Zod schema exports, `@Res()` usage in document download, `WorkshopsService` has 8 injected dependencies (SRP), `@Cron()` in business service (SoC violation), duplicated response assembly pattern (5×).

### Booking Module (38 findings: 1C/9H/17M/8L)
**Strengths:** Excellent Mechanic pattern for Redis operations, consistent IDOR enforcement via `@CurrentUser()`, ACID transactions with pessimistic locking, thorough Contract-Oriented JSDoc, clean module boundaries, proper guard chaining with webhook exception.
**Weaknesses:** Most findings of any module. Critical missing repo method, `process.env.JWT_SECRET!` in two services, query params bypass Zod validation, JWT signing duplicated, VNPAY/STRIPE/MOMO placeholder cases (YAGNI), 3 methods over 100 lines, `any` types proliferating in DTOs and transaction contexts.

### Checkin Module (18 findings: 2C/3H/7M/6L) — Pass 1 + Pass 2
**Strengths:** Cleanest module overall. Excellent IDOR protection (404 for non-owned tickets), strong Result pattern, thin controllers, well-separated module boundaries, thorough documentation.
**Weaknesses (Pass 1):** Critical missing `createZodDto` on scan/sync DTOs (no input validation), application-level filtering in repository queries (scalability concern), cross-module DB access from `CheckinRecordsRepository` into booking's `registrations` table.
**Weaknesses (Pass 2 — new):** `countConfirmedRegistrationsByWorkshopId` missing `WHERE status = 'CONFIRMED'` — counts ALL registrations producing **wrong dashboard statistics** (CRITICAL), `CatalogModule` imported but never used (HIGH), QR validation logic duplicated across CheckinService/OfflineSyncService (HIGH), `offlineCheckinQueue` table defined but never referenced (HIGH), Builder classes with single static method over-engineered, checkin record creation payload duplicated, identical Drizzle `with` block repeated 4×, `findByQRToken` over-fetches unused workshop/student data, unsafe `as` type assertions on query results.

### Background Module (28 findings: 3C/8H/10M/7L)
**Strengths:** Excellent Strategy pattern for notification channels (OCP-compliant), thin controllers, consistent `tryCatch` in repositories, proper BullMQ worker structure, stable cron error handling (every job wrapped in try/catch), consistent security on admin endpoints.
**Weaknesses:** Most architectural violations of any module. Direct DB access in 2 services (bypasses repository layer), worker bypasses service layer, `StudentSyncService` at 378 lines (SRP), duplicated constants across 3 files (KNOWN_GATEWAYS, CIRCUIT_KEY_PREFIX, DISCREPANCY_THRESHOLD), `Result<any>` return types, `Promise.race` timer leak in AiSummaryWorker, 3 TODO comments in production code, data mapping bugs in `StudentSyncJobResponse.from()`.

### Platform Infrastructure (41 findings: 2C/4H/17M/18L) — Pass 1 + Pass 2
**Strengths:** Clean Result pattern architecture, well-separated response pipeline, excellent SDK encapsulation in RedisService/StorageService, comprehensive database schema with pgEnum/CHECK constraints/partial unique indexes, proper `forRoot()` pattern in StorageModule, extensible error factory system.
**Weaknesses (Pass 1):** Systematic `process.env` usage across ALL infrastructure modules. DatabaseModule initializes drizzle at import time (test isolation broken). Paginated response drops `processingMs`. StorageService has duplicated S3 GetObject logic (~60 lines). syncStatus uses varchar instead of pgEnum (inconsistent). Vietnamese comments in cors.config.ts.
**Weaknesses (Pass 2 — new):** `isPaginatedShape` allows `NaN` values — `typeof NaN === 'number'` in JS (CRITICAL), `IdempotencyKey` decorator casts header as `string` but Express headers can be `string[]` (CRITICAL), `GlobalExceptionFilter` uses Express types instead of `HttpAdapterHost` (Fastify migration blocked), `DatabaseModule` lacks `forRootAsync` dynamic module pattern, `scanKeys` doesn't destroy stream on error (resource leak), `jsonGet`/`jsonSet` bypass their own `get`/`set` abstraction, `ErrorCode` union violates ISP with ~40 members, dead code: `FailResult.propagate()`, `chainAsync()`, `Result.combine`, `OkResult.map` — all zero callers.

---

## Architecture Health Assessment

### Overall Grade: B (Good foundation, 15 critical blockers)

The server codebase demonstrates strong architectural discipline in its core conventions — the Result pattern, layered architecture, mechanic abstractions, and error factory system form a cohesive foundation. However, the 15 critical findings reveal **systematic integration gaps** that must be resolved before production deployment.

### Root Cause Analysis

The 183 findings across 6 modules are not random — they cluster around **6 root causes**:

**Root Cause 1: Services written before dependencies completed (C4, C5, C6, C7, C8, C9, P2.C1).**
Three repository methods are called but don't exist. Two services bypass repositories entirely. One SQL query is missing its most important WHERE clause. The pattern is consistent: integration points were declared (a service calls a repo method) but never validated against the actual implementation. TypeScript can only catch this if the entire project is built together — unit tests with mocked repos mask the problem.

**Root Cause 2: Auth designed on paper, never integration-tested (C1, C2, P2.1, P2.5).**
The WEB refresh token cookie is set but never read. `revokeUserTokens` is a stub. MOBILE refresh gets the wrong token expiry. Admin suspension blacklists the wrong user's token. These are not subtle race conditions — they are basic flow failures that any end-to-end auth test would catch. The auth architecture is conceptually sound (dual tokens, rotation, blacklisting) but the implementation was never validated against real HTTP clients.

**Root Cause 3: ConfigService skipped during initial scaffolding (Platform systemic, Booking NS1).**
Every infrastructure module reads `process.env` directly. The DatabaseModule initializes at import time (before DI is available). The root cause is that NestJS `ConfigModule.forRoot()` + `ConfigService` injection requires additional boilerplate that was skipped during initial project scaffolding. This is the most pervasive architectural debt — 6 files, 5 modules, every infrastructure layer.

**Root Cause 4: Two competing validation philosophies (IAM + Checkin vs Catalog + Booking).**
The codebase split on a fundamental NestJS pattern: IAM and Checkin use `z.infer<>` types with manual `Schema.parse()` in controllers, while Catalog and Booking use `createZodDto` classes with global `ZodValidationPipe`. This means half the endpoints may or may not validate input depending on global pipe configuration. The inconsistency suggests the codebase was built by different developers working from different examples.

**Root Cause 5: Background module built under different architectural rules.**
Background is the only module where services call `this.db` directly. It has the most SRP violations (378-line service, 260-line service). Yet its notification channel system is textbook Strategy pattern. This suggests the module was prototyped rapidly and never refactored to match the layered architecture conventions established by the other modules.

**Root Cause 6: Speculative code without cleanup discipline.**
`FailResult.propagate()`, `chainAsync()`, `Result.combine`, `OkResult.map` — all zero callers. `offlineCheckinQueue` table — zero references. `CatalogModule` imported in Checkin — unused. `StudentProfileService` — pure pass-through. `PENDING_VERIFICATION` in union type — never passed. These are all "we might need this" additions that were never removed. Each one adds maintenance burden, confuses new developers, and bloats the API surface.

### Risk Heat Map

| Risk Domain | Criticals | Impact | Likelihood |
|-------------|-----------|--------|------------|
| **Auth & Security** | 5 (C1, C2, C3, P2.1, P2.5) | Token theft, session hijack, false security confidence | **Certain** — triggered on every WEB refresh, every admin suspension |
| **Data Correctness** | 5 (C4, C5, C6, P2.C1, P2.2.1) | Corrupt statistics, wrong counter values, invalid JSON | **Certain** — triggered on every cron run, every dashboard view |
| **Architecture Violations** | 3 (C7, C8, C10) | Untestable services, dual update paths, unvalidated input | **Certain** — structural, present in all code paths |
| **Infrastructure** | 2 (C9, P2.2.2) | Webhook failures, crashes from duplicate headers | **Conditional** — depends on gateway behavior and client headers |

### What's Working Well
- **IDOR protection** is consistently enforced across all 5 modules — student queries always use `jwt.sub`
- **All controllers are thin** — zero business logic leakage into the HTTP layer
- **Response DTOs** properly strip internal DB fields via `from()` factories
- **Repository error handling** is consistent — all use `tryCatch` with `systemErrors.internal`
- **Cross-module communication** follows Service→Service pattern (with one exception)
- **JSDoc coverage** is excellent — nearly every public method has contract-oriented documentation
- **Strategy pattern** in notification channels is textbook OCP — best-designed subsystem in the codebase
- **Mechanic pattern** in Booking encapsulates Redis operations cleanly — reusable, testable, well-abstracted

### What Needs Immediate Attention
1. **15 critical issues** — 5 auth, 5 data correctness, 3 architecture, 2 infrastructure
2. **3 modules never built together** with their dependencies (Catalog→repo, Booking→repo, Checkin→DB)
3. **WEB auth completely broken** — no browser client can maintain a session
4. **Background module needs architectural realignment** to match the other 4 modules' layered pattern
5. **`process.env` proliferation** blocks testability across the entire platform layer

---

## Strategic Improvement Plan

### Phase 1: Critical Fixes (Must Fix Before Any Deployment)

**Estimated total: ~16 hours**

#### Auth & Security (5 fixes)

| # | Issue | Module | Effort | Root Cause |
|---|-------|--------|--------|------------|
| P1-1 | Fix WEB refresh token cookie reading — read `request.cookies?.refreshToken` as fallback when body token is empty | IAM | 30min | RC2: never integration-tested |
| P1-2 | Fix `refreshToken()` hardcoded WEB expiry — pass platform parameter, use `ACCESS_EXPIRY[platform]` | IAM | 1hr | RC2: never integration-tested |
| P1-3 | Implement `revokeUserTokens` or rename to avoid false confidence — add Redis `user:suspended:{userId}` flag checked by JwtAuthGuard, OR rename method to `checkUserExists()` | IAM | 2hr | RC2: designed on paper only |
| P1-4 | Fix `updateUserStatus` token blacklisting — blacklist the **target user's** tokens, not the admin's. Add per-user jti tracking or Redis suspension flag | IAM | 2hr | RC2: token lifecycle bug |
| P1-5 | Fix HmacSignatureGuard — use `request.rawBody` with raw body parser middleware instead of `JSON.stringify(request.body)` | IAM/Core | 2hr | RC2: never tested with real gateway signatures |

#### Data Correctness (5 fixes)

| # | Issue | Module | Effort | Root Cause |
|---|-------|--------|--------|------------|
| P1-6 | Add missing `findPublishedBasic()` to WorkshopsRepository — `SELECT workshopId, capacity FROM workshops WHERE status = 'PUBLISHED'` | Catalog | 30min | RC1: service written before repo |
| P1-7 | Fix `reconcileSlot` → `reconcile` parameter mapping — drop `capacity` from the call, pass only `(workshopId, lockedCount, confirmedCount)` | Catalog | 15min | RC1: signature mismatch |
| P1-8 | Add missing `countConfirmedByWorkshop` to RegistrationsRepository | Booking | 30min | RC1: service written before repo |
| P1-9 | Add `WHERE status = 'CONFIRMED'` to `countConfirmedRegistrationsByWorkshopId` | Checkin | 15min | RC1: SQL missing critical filter |
| P1-10 | Fix `isPaginatedShape` NaN — use `Number.isFinite()` instead of `typeof === 'number'`, add `>= 0` constraint | Platform | 30min | RC6: edge case not considered |

#### Architecture Violations (3 fixes)

| # | Issue | Module | Effort | Root Cause |
|---|-------|--------|--------|------------|
| P1-11 | Remove direct DB access from StudentSyncService — inject StudentsRepository (or IAM's StudentService) for `upsertStudent()` | Background | 2hr | RC5: different architectural rules |
| P1-12 | Remove direct DB access from SystemMonitorService — extract DB queries into appropriate repositories (WorkshopsRepository, PaymentsRepository) | Background | 2hr | RC5: different architectural rules |
| P1-13 | Add `createZodDto` to Checkin scan/sync DTOs — `export class ScanQRDto extends createZodDto(ScanQRSchema) {}`, switch from `import type` to regular import | Checkin | 30min | RC4: wrong validation pattern |

#### Infrastructure (2 fixes)

| # | Issue | Module | Effort | Root Cause |
|---|-------|--------|--------|------------|
| P1-14 | Fix `IdempotencyKey` header handling — normalize `string | string[]` to `string`: `Array.isArray(raw) ? raw[0] : raw` | Shared | 15min | RC6: edge case not considered |
| P1-15 | Fix AiSummaryWorker to use AiSummaryService instead of directly injecting AiSummariesRepository — add `handleTimeout(documentId)` method to service | Background | 1hr | RC5: worker bypasses service |

### Phase 2: High Priority (Architectural Alignment — First Sprint)

**Estimated total: ~28 hours**

#### ConfigService Migration (highest-impact architectural fix)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P2-1 | Install & configure `@nestjs/config` with Zod-validated config schema at app bootstrap | Platform | 2hr |
| P2-2 | Migrate `cors.config.ts` — inject ConfigService instead of `process.env.FRONTEND_URL` | Platform | 1hr |
| P2-3 | Migrate `logger.config.ts` — inject ConfigService for LOG_LEVEL, NODE_ENV | Platform | 1hr |
| P2-4 | Migrate `database.module.ts` — `forRootAsync()` with ConfigService, remove module-level `dotenv.config()` and drizzle init | Platform | 3hr |
| P2-5 | Migrate `redis.service.ts` — accept REDIS_URL via DI instead of `process.env.REDIS_URL!` | Platform | 1hr |
| P2-6 | Migrate `queue.module.ts` — `forRootAsync()` with ConfigService for REDIS_URL | Platform | 1hr |
| P2-7 | Migrate `payments.service.ts` and `registrations.service.ts` — replace `process.env.JWT_SECRET!` with ConfigService | Booking | 1hr |

#### Validation Consistency

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P2-8 | Adopt `createZodDto` for all 4 IAM DTOs — LoginDto, RefreshTokenDto, AssignWorkshopsDto, UpdateUserStatusDto; remove manual `Schema.parse()` from controllers | IAM | 2hr |
| P2-9 | Add Zod query DTOs for Booking paginated endpoints — `GetPaymentsQueryDto`, `GetRegistrationsQueryDto` | Booking | 2hr |

#### Auth Consolidation

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P2-10 | Extract JWT signing to shared `QrTokenService` in IAM — eliminate duplication across PaymentsService and RegistrationsService | IAM/Booking | 3hr |
| P2-11 | Replace `@Res({ passthrough: true })` in AuthController with cookie decorator or interceptor | IAM | 3hr |
| P2-12 | Extract JWT verification to shared utility — eliminate duplication between JwtAuthGuard and TokenService | IAM/Core | 2hr |

#### Code Quality Quick Wins

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P2-13 | Replace inline error objects with error factories — add missing `USER_NOT_FOUND`, `VALIDATION_FAILED` codes to `authErrors` | IAM | 1hr |
| P2-14 | Extract duplicated constants in Background — `KNOWN_GATEWAYS`, `CIRCUIT_KEY_PREFIX`, `DISCREPANCY_THRESHOLD`, cron last-run keys → `background/constants/` | Background | 1hr |
| P2-15 | Remove placeholder VNPAY/STRIPE/MOMO cases from payment-gateway.service.ts | Booking | 30min |
| P2-16 | Fix `Promise.race` timer leak in AiSummaryWorker — clear timeout on resolution | Background | 1hr |
| P2-17 | Fix data mapping bugs in `StudentSyncJobResponse.from()` — `started_at` hardcoded to undefined, `failed_rows`/`error_count` both map to `errorRows` | Background | 1hr |
| P2-18 | Add `processingMs` to paginated response path in ResponseInterceptor | Platform | 30min |
| P2-19 | Fix `scanKeys` stream resource leak — add `stream.destroy()` in error handler | Platform | 30min |
| P2-20 | Fix `jsonGet`/`jsonSet` to delegate through `this.get()`/`this.set()` instead of calling `this.client` directly | Platform | 30min |

### Phase 3: Medium Priority (Code Quality & DRY — Second Sprint)

**Estimated total: ~34 hours**

#### Service Decomposition (SRP)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P3-1 | Split WorkshopsService — extract cron/reconciliation methods into `WorkshopCronService` | Catalog | 4hr |
| P3-2 | Split StudentSyncService (378 lines) → `StudentSyncJobService` + `StudentRowValidator` + `StudentUpsertService` | Background | 4hr |
| P3-3 | Split SystemMonitorService (260 lines) → `PaymentMonitorService` + `ReconciliationMonitorService` + `CircuitBreakerMonitorService` | Background | 3hr |
| P3-4 | Extract long methods in PaymentsService — `initiate` (102 lines), `handleWebhook` (125 lines) → private helpers | Booking | 3hr |
| P3-5 | Extract long method in RegistrationsService — `register` (115 lines) → private helpers with consolidated rollback | Booking | 2hr |

#### DRY Extractions

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P3-6 | Extract shared S3 GetObject helper in StorageService — `getFileStream` and `getFileBuffer` share ~60 lines | Platform | 2hr |
| P3-7 | Extract QR token validation to shared method in TicketService — duplicated across CheckinService and OfflineSyncService | Checkin | 2hr |
| P3-8 | Extract checkin record payload construction to shared factory — duplicated across CheckinService and OfflineSyncService | Checkin | 1hr |
| P3-9 | Extract `loadStaffWorkshops` helper in AuthService — duplicated 3× in login/refreshToken/getMe | IAM | 1hr |
| P3-10 | Extract duplicated response assembly pattern in WorkshopsService — repeated 5× in create/update/publish/emergencyUpdate/cancel | Catalog | 2hr |
| P3-11 | Extract Drizzle `with` block constant in TicketsRepository — identical block repeated 4× | Checkin | 30min |

#### Database Schema Fixes

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P3-12 | Add `syncStatusEnum` pgEnum — replace varchar(20) CHECK constraint on `offlineCheckinQueue.syncStatus` | Platform | 1hr |
| P3-13 | Add partial index on `offlineCheckinQueue.syncStatus WHERE sync_status = 'PENDING'` | Platform | 30min |
| P3-14 | Add DB-level filtering in Checkin repository queries — restructure `findByStudentIdAndStatus` and `findByWorkshopIdAndStatus` to use SQL WHERE instead of JS `.filter()` | Checkin | 2hr |
| P3-15 | Derive event-contract types from DB enum zod schemas — eliminate hand-maintained parallel type unions in `event-contracts.ts` | Platform | 2hr |

#### Cross-Module Boundary Fixes

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P3-16 | Fix cross-module DB access in CheckinRecordsRepository — move `countConfirmedRegistrationsByWorkshopId` to BookingService, inject into CheckinService | Checkin | 2hr |
| P3-17 | Remove `CatalogModule` import from CheckinModule — unused dependency | Checkin | 5min |
| P3-18 | Move `WorkshopScopeGuard` from `core/guards/` to `modules/checkin/guards/` — module-specific guard in wrong layer | IAM | 30min |

### Phase 4: Low Priority (Continuous Improvement — Ongoing)

**Estimated total: ~20 hours**

#### Dead Code Removal

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P4-1 | Remove `FailResult.propagate<U>()` — zero callers across codebase | Platform | 5min |
| P4-2 | Remove `chainAsync` utility — zero callers; inline `isFailure` checks are the established pattern | Platform | 5min |
| P4-3 | Remove `Result.combine` — zero callers (verify first) | Platform | 5min |
| P4-4 | Remove `OkResult.map` — zero callers; `ResponseDto.from()` factories are the established transformation pattern | Platform | 5min |
| P4-5 | Remove unused Zod schema exports from Catalog DTO files — schemas only consumed by `createZodDto()` in same file | Catalog | 15min |
| P4-6 | Remove `PENDING_VERIFICATION` from `updateStatus` union type — never passed | IAM | 5min |
| P4-7 | Remove dead `aiSummary` parameter from `WorkshopResponseBuilder.fromDetail` — unused with lint suppression | Catalog | 15min |
| P4-8 | Wire up or remove `offlineCheckinQueue` table — zero references in modules directory | Checkin | 1hr |

#### Type Safety Improvements

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P4-9 | Replace `as TicketWithRegistration` assertions in TicketsRepository — let Drizzle's inferred types flow naturally | Checkin | 30min |
| P4-10 | Define `DrizzleTx` type alias — replace `tx: any` in all repository transaction parameters | Booking/Shared | 1hr |
| P4-11 | Replace `any` in DTOs — `PaymentResponseBuilder.payment: any`, `RegistrationWithDetailsDto.payment?: any`, `waitlistEntry?: any` | Booking | 1hr |
| P4-12 | Add runtime Zod validation for Redis `hGetAll` response — eliminate `unknown as TokenBucket` cast in rate-limiter | Booking | 1hr |
| P4-13 | Add `@nestjs/config` ConfigSchema with Zod validation for all env vars at startup | Platform | 2hr |

#### Documentation & Convention

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P4-14 | Translate Vietnamese comments in `cors.config.ts` to English | Platform | 15min |
| P4-15 | Remove TODO comments from production code — implement or create external tickets | Background | 30min |
| P4-16 | Fix contradictory `@throws` in `builder.ts` — function says `@throws Never` but transform callback can throw | Platform | 5min |
| P4-17 | Fix inconsistent snake_case vs camelCase in auth responses — use `LoginResponseBuilder` in `refreshToken()` | IAM | 30min |

#### Refactoring

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| P4-18 | Replace Builder classes with plain functions — `CheckinStatusBuilder`, `SyncResultBuilder`, `TicketResponseBuilder` → `buildCheckinStatus()`, etc. | Checkin | 30min |
| P4-19 | Flatten `TicketInput` interface — reduce 4-level `ticket.registration.workshop.workshopId` chains to 2 levels | Checkin | 1hr |
| P4-20 | Wrap `jwt.sign` in `tryCatch` — return `Result<string>` like verification methods | IAM | 1hr |
| P4-21 | Remove `Promise.resolve(jwt.sign(...))` misleading async wrapper — `jwt.sign` is synchronous; either make it truly sync or wrap properly | IAM | 30min |
| P4-22 | Add `forRootAsync()` variant to StorageModule for consistency with NestJS conventions | Platform | 1hr |
| P4-23 | Migrate `RolesGuard` to `Reflector.createDecorator<string[]>()` — eliminate magic string `"roles"` | IAM | 30min |
| P4-24 | Add guard clause to `@CurrentUser()` decorator — throw clear error when JwtAuthGuard is not applied | Platform | 15min |
| P4-25 | Remove `StudentProfileService` pass-through — inline into `AuthService.getMe` or add JSDoc explaining reserved future use | IAM | 15min |
| P4-26 | Remove `crypto.randomUUID()` from CheckinRecordsRepository.create — let DB generate the UUID via default | Checkin | 15min |

---

## Effort Summary

| Phase | Scope | Fixes | Est. Hours | Cumulative |
|-------|-------|-------|-----------|------------|
| Phase 1 | Critical — Must fix before deployment | 15 | 16h | 16h |
| Phase 2 | High — Architectural alignment | 20 | 28h | 44h |
| Phase 3 | Medium — Code quality & DRY | 18 | 34h | 78h |
| Phase 4 | Low — Continuous improvement | 26 | 20h | 98h |
| **Total** | | **79 fixes** | **~98 hours** | |

---

## Conclusion

The Unihub NestJS server is a **well-designed codebase with 15 critical integration gaps** — not a broken architecture, but an incompletely validated one. The core patterns (Result monad, layered architecture, mechanic abstractions, error factories, Strategy channels) are sound and consistently applied across 4 of 5 modules. The problems cluster at integration points: services calling non-existent repository methods, auth flows that were designed but never tested end-to-end, and a Background module built under different architectural rules than the rest of the codebase.

The path to production readiness is clear and mechanical:
1. **Phase 1 (16h):** Fix all 15 criticals — most are 15-30 minute fixes (missing WHERE clause, wrong parameter order, missing method) with a few 2-hour auth reworks
2. **Phase 2 (28h):** Migrate to ConfigService, adopt `createZodDto` everywhere, centralize JWT signing — this eliminates the most pervasive architectural debt
3. **Phase 3 (34h):** Decompose oversized services, extract duplicated logic, fix database schema inconsistencies
4. **Phase 4 (20h):** Remove dead code, tighten types, fix documentation — polish for long-term maintainability

The most impactful single change is **Phase 2 ConfigService migration** — it touches every infrastructure module and unblocks testing across the entire platform layer. The second most impactful is **Phase 2 JWT signing centralization** — it eliminates 2 duplication sites, fixes the SRP violation in Booking services, and establishes IAM as the single authority for all token operations.

**What the 183 findings do NOT reveal:** fundamental design flaws. The Result pattern works. The layered architecture works. The guard chain works. The mechanic pattern works. The Strategy channels work. This is a codebase worth fixing — the problems are at the integration seams, not in the core design.

---

*Report generated by 6-agent code review team with 3 Pass 2 cross-reviewers. Individual module reports: `01-iam-review.md`, `02-catalog-review.md`, `03-booking-review.md`, `04-checkin-review.md`, `05-background-review.md`, `06-platform-review.md`.*
