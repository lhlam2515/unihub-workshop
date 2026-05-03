# Checkin Module Code Review

**Scope:** apps/server/src/modules/checkin/
**Date:** 2026-05-02

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 1.1 | **Request DTOs not using `createZodDto`** — `ScanQRSchema` and `OfflineSyncSchema` are plain Zod schemas with only inferred type exports. The controllers use `import type` for DTO imports, so the Zod schemas are never instantiated at runtime. NestJS `ZodValidationPipe` (via `nestjs-zod`) requires a class extending `createZodDto(Schema)` to trigger validation. This means `POST /checkin/scan` and `POST /checkin/sync` accept **unvalidated** request bodies. | `scan-qr.dto.ts:1-16`, `offline-sync.dto.ts:1-14`, `checkin.controller.ts:23-24,58,78` | **CRITICAL** | Convert both DTOs to use `createZodDto`: `export class ScanQRDto extends createZodDto(ScanQRSchema) {}` and `export class OfflineSyncDto extends createZodDto(OfflineSyncSchema) {}`. Update controller imports from `import type` to regular imports. |

### 1.2 Techniques

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| — | *No issues found.* Controllers are thin (no business logic). Services return `Result` types consistently. Global `ResponseInterceptor` handles HTTP mapping. | — | — | — |

### 1.3 Security

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| — | *No issues found.* `@Roles` decorators are correctly applied (`CHECKIN_STAFF` at class level on `CheckinController`, `STUDENT` on `TicketsController`). `WorkshopScopeGuard` enforces workshop scoping. IDOR protection is correct — `TicketsController` uses `user.sub` exclusively for student queries. `TicketService.getTicketDetail` returns 404 (not 403) for non-owned tickets to avoid confirming existence. | — | — | — |

## 2. Code Quality Principles

### 2.1 KISS

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.1.1 | **Application-level filtering in repository queries** — `findByStudentIdAndStatus` and `findByWorkshopIdAndStatus` fetch ALL tickets matching a status from the DB, then filter in-memory using JS `.filter()`. This doesn't scale: if the system has thousands of active tickets across all workshops, every student ticket list or staff preload fetch pulls them all before narrowing. | `tickets.repository.ts:119-143,155-180` | **MEDIUM** | Restructure queries to filter at the DB level. Use Drizzle's `where` with subqueries or raw SQL to push the studentId/workshopId filter into the SQL WHERE clause. Add a composite index on `(status, registration_id)` to support this. |

### 2.2 YAGNI

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| — | *No issues found.* No dead code, no TODO stubs, no placeholder implementations, no unused parameters. | — | — | — |

### 2.3 DRY

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.3.1 | **Identical type definitions** — `TicketWithRegistration` (line 11) and `TicketWithWorkshopAndStudent` (line 26) are structurally identical. Each describes a ticket with deeply nested registration → workshop + student relations. One should be reused instead of duplicated. | `tickets.repository.ts:11-39` | **LOW** | Remove `TicketWithWorkshopAndStudent` and use `TicketWithRegistration` for both `findById`/`findByQRToken` and `findByWorkshopIdAndStatus`. The semantic name difference adds no real value since the returned shape is the same. |

### 2.4 SOLID

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| — | *No issues found.* SRP is well maintained: each class has a single, clear responsibility. DIP is respected (abstractions via DI tokens). | — | — | — |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.5.1 | **Cross-module data access in repository** — `CheckinRecordsRepository.countConfirmedRegistrationsByWorkshopId` directly queries the `registrations` table (which belongs to the **booking** module's domain). Per project architecture ("Cross-module communication: only Service → Service"), the checkin module should obtain registration counts through the booking module's service, not by directly accessing its tables. This creates implicit coupling to the booking module's data schema. | `checkin-records.repository.ts:118-131` | **MEDIUM** | Move `countConfirmedRegistrationsByWorkshopId` into a `BookingService` method (or RegistrationService) and export it. Have `CheckinService` import and call that service method instead. This preserves the single-responsibility boundary and insulates checkin from booking schema changes. |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| 2.6.1 | **Deep property access chains** — Service code accesses `ticket.registration.workshopId` (3 levels) and `ticket.registration.studentId` (3 levels) directly. DTO builder accesses `ticket.registration.workshop.workshopId` (4 levels) and `ticket.registration.student.studentId` (4 levels). While partially unavoidable with ORM relation loading, these chains couple the caller to the full entity graph shape. | `checkin.service.ts:57,65`, `offline-sync.service.ts:51-52`, `ticket-response.dto.ts:57,63` | **LOW** | Destructure at the point of retrieval: `const { registration } = ticket;` then access `registration.workshopId`. For the DTO builder, accept a flatter intermediate type or destructure earlier to limit chain depth to 2. |

## 3. Strategic Recommendations

### 3.1 Immediate Fixes (Critical)

1. **CRITICAL: Wire up `createZodDto` for request DTOs.** Without this, `POST /checkin/scan` and `POST /checkin/sync` accept unvalidated payloads. Production data could be silently corrupted by invalid UUIDs, missing tokens, or malformed timestamps. This is a 5-minute fix but has direct correctness and safety implications.

### 3.2 Short-Term Improvements (High)

1. **Optimize repository queries.** Both `findByStudentIdAndStatus` and `findByWorkshopIdAndStatus` should filter at the database level rather than loading all status-matching tickets into memory. Add appropriate indexes and refactor to use Drizzle's `where` with joined filters or a raw SQL approach.

### 3.3 Long-Term Architecture

1. **Formalize cross-module service contracts.** The `CheckinRecordsRepository` currently crosses into the booking module's data domain by querying `registrations`. Define a clean service boundary (e.g., `BookingService.getConfirmedRegistrationCount(workshopId)`) and inject it where needed. This keeps the database as a shared resource while maintaining module autonomy.

## Finding Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| NestJS Compliance | 1 | 0 | 0 | 0 | 1 |
| Code Quality | 0 | 0 | 2 | 2 | 4 |
| **Total** | **1** | **0** | **2** | **2** | **5** |

### Key Strengths
- **Clean IDOR protection**: `TicketsController` correctly scopes all queries to `jwt.sub`. `TicketService.getTicketDetail` returns 404 rather than 403 for cross-ownership lookups, a solid security practice.
- **Strong Result pattern usage**: Services consistently return `Result.ok()`/`Result.fail()`, controllers are thin delegators, and no `try/catch` or `throw` appears in business logic.
- **Excellent documentation**: All public methods have thorough Contract-Oriented JSDoc covering business rules, side effects, and error codes.
- **Good module boundaries**: Controllers, services, repositories, and DTOs are cleanly separated. `CheckinModule` correctly exports `TicketService` for cross-module use.

### Key Weaknesses
1. **Missing `createZodDto` on request DTOs** (Critical) — The most impactful finding. Scan and sync endpoints lack runtime validation because DTOs are plain types, not NestJS-validated classes.
2. **Inefficient repository queries** (Medium) — Two repository methods filter in application memory instead of the database, negatively impacting scalability.
3. **Cross-module data coupling** (Medium) — The checkin repository reaches into the booking module's `registrations` table directly, bypassing the service layer contract.

---

## Pass 2 Additions (NestJS Docs + Code Quality Specialist)

*Second pass conducted 2026-05-02 with NestJS official documentation cross-reference and code-review-specialist subagent evaluation.*

### P2-C1 (CRITICAL): `countConfirmedRegistrationsByWorkshopId` Counts ALL Registrations, Not Just CONFIRMED

**File:** `repositories/checkin-records.repository.ts:118-131`
**Principle:** Correctness / KISS

The method is named "count CONFIRMED registrations" and its JSDoc says "Counts confirmed registrations for a workshop to derive expected attendance." But the SQL has **no `WHERE status = 'CONFIRMED'` filter**:

```typescript
.from(this.schema.registrations)
.where(eq(this.schema.registrations.workshopId, workshopId));
// MISSING: .where(eq(this.schema.registrations.status, "CONFIRMED"))
```

This counts CANCELLED, PENDING_PAYMENT, and WAITLISTED registrations as if they were confirmed. The `CheckinStatusBuilder` uses this value as `confirmed_count` and derives `pending_count = confirmedCount - checkedInCount`. The result: **pending_count is inflated by every non-CANCELLED registration** and the workshop dashboard shows garbage statistics.

**Fix:** Add `and(eq(this.schema.registrations.status, "CONFIRMED"))` to the where clause.

### P2-H1 (HIGH): `CatalogModule` Imported but Never Used

**File:** `checkin.module.ts:26`
**Principle:** YAGNI

`CatalogModule` is listed in the module's `imports` array (`imports: [DatabaseModule, CatalogModule]`) with the comment "for workshop info", but no service, controller, or repository in the checkin module injects anything from CatalogModule. This is either speculative or leftover from a refactoring. Unused module imports create unnecessary DI graph complexity.

**Fix:** Remove `CatalogModule` from the imports array. Add back when a real dependency exists.

### P2-H2 (HIGH): QR Token Validation Logic Duplicated Across Two Services

**Files:** `services/checkin.service.ts:44-59`, `services/offline-sync.service.ts:43-55`
**Principle:** DRY

Both `CheckinService.scanQR` and `OfflineSyncService.processSyncBatch` execute the identical 5-step ticket validation sequence:
1. Call `ticketsRepo.findByQRToken(qrToken)`
2. Check `isFailure`
3. Check if ticket is null
4. Check if ticket status is VOID
5. Check if `ticket.registration.workshopId` matches expected workshop

The only difference is the error response: `scanQR` returns `Result.fail()`, while `processSyncBatch` increments a `conflicts` counter and continues. If a new validation rule is added (e.g., workshop must be published), both methods must be updated.

**Fix:** Extract a shared validation method (e.g., `TicketService.validateQRToken(qrToken, workshopId)`) returning either the validated ticket or a categorized failure reason.

### P2-H3 (HIGH): `offlineCheckinQueue` Table Defined but Never Referenced

**File:** `database/schema/transaction.schema.ts:165-187`
**Principle:** YAGNI

The `offlineCheckinQueue` table is defined with columns (`localId`, `qrToken`, `workshopId`, `checkedInAt`, `deviceId`, `checkedInBy`, `syncStatus`, `syncedAt`, `conflictReason`) and a CHECK constraint, but **zero references** exist across the entire modules directory. `OfflineSyncService` bypasses this queue table entirely and writes directly to `checkin_records`. Either the queue table is dead schema or the offline sync implementation is incomplete relative to the original design.

**Fix:** Either wire up `OfflineSyncService` to use the queue table for proper offline-first architecture, or remove the dead schema. The Platform review also noted this table (finding 3.3: missing indexes on `syncStatus`).

### P2-M1 (MEDIUM): Builder Classes with Single Static Method Are Over-Engineered

**Files:** `dto/checkin-status.dto.ts:21-52`, `dto/sync-result.dto.ts:8-35`, `dto/ticket-response.dto.ts:38-70`
**Principle:** KISS / YAGNI

All three "*Builder" classes (`CheckinStatusBuilder`, `SyncResultBuilder`, `TicketResponseBuilder`) have exactly one `static from()` method and no mutable state. A class implies multiple related transformation methods, but there is only one. The "Builder" suffix also implies the GoF Builder pattern (stepwise construction), which is not what these do — they are pure transformation functions. A plain exported function is simpler.

**Fix:** Replace each static builder class with a named function (e.g., `buildTicketResponse(ticket)`, `buildCheckinStatus(...)`, `buildSyncResult(...)`).

### P2-M2 (MEDIUM): Checkin Record Creation Payload Duplicated

**Files:** `services/checkin.service.ts:62-71`, `services/offline-sync.service.ts:58-68`
**Principle:** DRY

The identical 8-field payload for `checkinRecordsRepo.create()` is constructed in both `CheckinService.scanQR` and `OfflineSyncService.processSyncBatch` with the same field mappings (`registrationId`, `ticketId`, `studentId`, `workshopId`, `checkedInAt`, `checkedInBy`, `source`, `deviceId`). Only `checkedInAt` value and `source` string differ between the two callers.

**Fix:** Extract a static factory method on the repository or a shared helper in `TicketService`.

### P2-M3 (MEDIUM): Identical Drizzle `with` Block Repeated 4× in TicketsRepository

**File:** `repositories/tickets.repository.ts:66-73, 94-101, 127-134, 162-169`
**Principle:** DRY

The exact same Drizzle `with` clause for loading `registration → { workshop, student }` appears in `findByQRToken`, `findById`, `findByStudentIdAndStatus`, and `findByWorkshopIdAndStatus`. If the relation structure changes, all 4 must be updated.

**Fix:** Extract into a module-level constant: `const ticketWithRelations = { registration: { with: { workshop: true, student: true } } }`.

### P2-M4 (MEDIUM): `findByQRToken` Over-Fetches Workshop/Student Data Callers Don't Use

**File:** `repositories/tickets.repository.ts:59-79`
**Principle:** YAGNI

`findByQRToken` eagerly loads `registration.workshop` (workshopId, title, startsAt, endsAt) and `registration.student` (studentId, fullName, studentCode). Both callers (`scanQR` and `processSyncBatch`) only need `ticket.status`, `registration.workshopId`, `registration.studentId`, `registrationId`, and `ticketId`. They never read `workshop.title`, `startsAt`, `endsAt`, `student.fullName`, or `student.studentCode`. Loading these adds unnecessary DB join overhead and data transfer.

**Fix:** Use Drizzle's `columns` option to restrict to needed fields, or add a lighter `findByQRTokenForValidation()` method.

### P2-M5 (MEDIUM): `Promise.race` Pattern for Timer — Same Issue as AiSummaryWorker

**File:** *(Not found in Checkin module directly, but noted for consistency — the subagent found no instance. Removed.)*

*Note: This finding was retracted during verification. The Checkin module does **not** use `Promise.race` for timeout handling. The offline sync processes sequentially by design.*

### P2-M6 (MEDIUM): Unsafe `as` Type Assertions on Drizzle Query Results

**File:** `repositories/tickets.repository.ts:76, 103`
**Principle:** Type Safety / SOLID (LSP)

Both `findByQRToken` and `findById` use `(result as TicketWithRegistration)` type assertions. If the Drizzle schema changes and the query returns a different shape, the `as` cast silently hides the mismatch at compile time and produces `undefined` at runtime.

**Fix:** Let Drizzle's type inference flow naturally from the `with` clause rather than asserting. If a cast is unavoidable, use `satisfies` for validation without widening.

### P2-L1 (LOW): Sequential `for...of` Loop Limits Batch Sync Throughput

**File:** `services/offline-sync.service.ts:42-77`
**Principle:** KISS / Performance

The `for...of` loop processes each offline sync item sequentially (await DB insert → next item). For large batches (100+ offline scans), total time is the sum of each insert's latency. The sequential approach provides deterministic ordering and avoids connection pool exhaustion, but for high-throughput scenarios, consider chunked parallelism with `Promise.allSettled`.

### P2-L2 (LOW): `findById` and `findByQRToken` Share Nearly Identical Query Bodies

**File:** `repositories/tickets.repository.ts:59-79 vs 89-107`
**Principle:** DRY

Both methods differ only in the WHERE field (`qrToken` vs `ticketId`). They share the same `with` block, same `tryCatch` wrapper, and same return type. Consider a private `findByField(field, value)` helper to consolidate.

### P2-L3 (LOW): `TicketInput` Interface in DTO File Tightly Coupled to Repository Shape

**File:** `dto/ticket-response.dto.ts:1-17`
**Principle:** Separation of Concerns

The `TicketInput` interface is defined privately in the DTO file but its shape is an exact mirror of the Drizzle query result. This creates an implicit dependency between the DTO and repository return types. If the repository query changes, `TicketInput` must also change.

**Fix:** Colocate this interface with the repository or derive it from the query result type.

### P2-L4 (LOW): Law of Demeter — 3-4 Level Property Chains

**Files:** `services/checkin.service.ts:57`, `services/offline-sync.service.ts:52`, `services/ticket.service.ts:80`, `dto/ticket-response.dto.ts:57-60`
**Principle:** Law of Demeter

Services navigate `ticket.registration.workshopId` (3 levels) and the DTO builder accesses `ticket.registration.workshop.workshopId` (4 levels). If Drizzle relation shapes change, all chains must be updated. Consider flattening commonly-accessed foreign keys at the repository return type level.

### NestJS Documentation Cross-Reference

Per NestJS official docs (`/nestjs/docs.nestjs.com`):

- **Guard pattern:** The checkin module correctly uses `@UseGuards(JwtAuthGuard, RolesGuard)` at class level with `@Roles("CHECKIN_STAFF")` — matches NestJS recommended pattern exactly.
- **Validation:** NestJS docs show `@UsePipes(new ZodValidationPipe(schema))` for Zod-based validation. The checkin module currently has neither `createZodDto` classes nor explicit `@UsePipes()` on scan/sync endpoints. Without both, validated input depends on the global pipe configuration.
- **Controller design:** Both controllers are properly thin — they extract params and delegate to services, returning `Result` types directly. This follows NestJS best practices.
- **Module structure:** `@Module()` decorator with `imports`, `controllers`, `providers`, `exports` is correctly configured. The unused `CatalogModule` import is the only deviation.

---

### Updated Finding Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| NestJS Compliance (Pass 1) | 1 | 0 | 0 | 0 | 1 |
| Code Quality (Pass 1) | 0 | 0 | 2 | 2 | 4 |
| **Pass 1 Subtotal** | **1** | **0** | **2** | **2** | **5** |
| Pass 2 — Correctness | 1 | 0 | 0 | 0 | 1 |
| Pass 2 — YAGNI | 0 | 2 | 1 | 0 | 3 |
| Pass 2 — DRY | 0 | 1 | 2 | 1 | 4 |
| Pass 2 — KISS | 0 | 0 | 1 | 1 | 2 |
| Pass 2 — Law of Demeter | 0 | 0 | 0 | 1 | 1 |
| Pass 2 — Type Safety | 0 | 0 | 1 | 0 | 1 |
| Pass 2 — SoC | 0 | 0 | 0 | 1 | 1 |
| **Pass 2 Subtotal** | **1** | **3** | **5** | **4** | **13** |
| **Grand Total** | **2** | **3** | **7** | **6** | **18** |
