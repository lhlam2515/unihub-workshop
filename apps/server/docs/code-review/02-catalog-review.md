# Catalog Module Code Review

**Reviewer:** Catalog Module Reviewer  
**Date:** 2026-05-02  
**Scope:** `apps/server/src/modules/catalog/` (production .ts files only)  
**Total Findings:** 20 (2 Critical, 2 High, 8 Medium, 8 Low)

---

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| F1 | Module registers all providers and controllers correctly with proper dependency injection | Compliant | `catalog.module.ts:49-81` | — | — |
| F2 | Controllers use constructor injection with `private readonly` for all services | Compliant | All controllers | — | — |
| F3 | `WorkshopsService` has 8 injected dependencies — excessive DI surface indicates SRP violation | SRP / DI surface | `workshops.service.ts:67-77` | Medium | Split into focused services: `WorkshopLifecycleService` (create/publish/cancel), `WorkshopQueryService` (list/detail/stats), `WorkshopScheduleService` (conflicts/emergency-update) |
| F4 | Controllers return `Result<T>` directly with global `ResponseInterceptor` handling HTTP mapping | Compliant | All controllers | — | — |
| F5 | `DocumentsAdminController.downloadDocument()` uses `@Res({ passthrough: true })` and manually handles `Result` failure throwing `NotFoundException` | Service error pattern violation | `documents-admin.controller.ts:136-156` | Medium | The controller bypasses `ResponseInterceptor` via `@Res()`. Consider wrapping stream response in a dedicated interceptor or documenting this as an accepted exception to the Result pattern convention. |
| F6 | `@Cron("0 * * * *")` decorator used directly in `WorkshopsService` — tight coupling of NestJS scheduling framework to business layer | Separation of Concerns | `workshops.service.ts:700` | Medium | Extract cron-triggered methods to a dedicated scheduled task service or use a standalone cron module that calls `WorkshopsService`. |
| F7 | Module imports `DatabaseModule`, `RedisModule`, `SharedQueueModule` — proper cross-module DI | Compliant | `catalog.module.ts:50` | — | — |
| F8 | All repositories use `@Inject(DATABASE_CONNECTION)` and `@Inject(DATABASE_SCHEMA)` consistently | Compliant | All repository files | — | — |
| F9 | `WorkshopNotificationPublisher` uses `@InjectQueue()` for BullMQ — proper queue injection | Compliant | `workshop-notification-publisher.service.ts:41` | — | — |
| F10 | WorkshopNotificationPublisher uses fire-and-forget with try/catch — proper resilience pattern | Compliant | `workshop-notification-publisher.service.ts` | — | — |

### 1.2 Techniques

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| F11 | All request DTOs use `createZodDto` from `nestjs-zod` for Zod-to-NestJS bridge | Compliant | All DTO files | — | — |
| F12 | All controllers rely on global `ZodValidationPipe` — no per-controller `@UsePipes()` | Compliant | All controllers | — | — |
| F13 | Response DTOs use `static from()` factory methods to map DB entities → API-safe responses | Compliant | All `*-response.dto.ts` files | — | — |
| F14 | `UpdateWorkshopSchema` uses both per-field `.optional()` and `.partial()` — redundant double-wrapping | Minor redundancy | `update-workshop.dto.ts:12-24` | Low | Remove individual `.optional()` calls and rely solely on `.partial()`, or vice versa. Either approach alone suffices. |
| F15 | `WorkshopsRepository.completePastPublished()` does not use `.returning()` on UPDATE — inconsistent with other repo methods | Pattern inconsistency | `workshops.repository.ts:312-329` | Low | Add `.returning()` for consistency with other repository methods, even if the caller only needs the row count. |
| F16 | Multer `FileInterceptor` upload may use default disk storage — no explicit `memoryStorage` configuration | Infrastructure config gap | `documents-admin.controller.ts:70` | Low | Ensure `MulterModule.register({ storage: memoryStorage() })` is configured at the app level, otherwise uploaded files are written to disk before being uploaded to S3. |

### 1.3 Security

| # | Finding | Violation | File:Line | Severity | Suggestion |
|---|---------|-----------|-----------|----------|------------|
| F17 | `WorkshopsPublicController` uses `@Public()` — proper pattern for public unauthenticated endpoints | Compliant | `workshops-public.controller.ts:35,52` | — | — |
| F18 | All admin controllers use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("ORGANIZER")` — proper RBAC | Compliant | All admin controllers | — | — |
| F19 | `DocumentsAdminController.uploadDocument()` uses `ParseFilePipe` with `MaxFileSizeValidator` and `FileTypeValidator` | Compliant | `documents-admin.controller.ts:73-80` | — | — |
| F20 | No IDOR vectors in catalog module — ORGANIZER-level endpoints are role-gated, not user-scoped | Acceptable | — | — | — |

---

## 2. Code Quality Principles

### 2.1 KISS

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| K1 | `WorkshopResponseBuilder.fromDetail()` accepts `aiSummary?: any` parameter with `@typescript-eslint/no-unused-vars` suppression — dead parameter that misleads callers | `workshop-response.dto.ts:91-92` | High | Remove the unused `aiSummary` parameter entirely. It creates a false contract and generates a lint suppression. Add it back when the AI summary display feature is actually implemented. |
| K2 | All repositories follow a consistent, simple pattern — each method does exactly one DB operation | Compliant | All repositories | — | — |
| K3 | Controllers are thin and only extract params/call services | Compliant | All controllers | — | — |
| K4 | `WorkshopsService.getPublishedWorkshopsBasic()` references `this.workshopsRepo.findPublishedBasic()` which is NOT defined in `WorkshopsRepository` | `workshops.service.ts:716` | Critical | **Missing method — will cause compile/runtime error.** Add `findPublishedBasic()` to `WorkshopsRepository` or remove the service method if unused. |

### 2.2 YAGNI

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| Y1 | Unused `aiSummary` parameter in `WorkshopResponseBuilder.fromDetail` with lint suppression | `workshop-response.dto.ts:92` | High | Remove dead code. Speculative parameter for future AI summary public display. |
| Y2 | Raw Zod Schema variables exported from DTO files but never consumed outside the DTO file (controllers import the DTO class, not the Schema) | Multiple DTO files | Low | Remove `export` from schema constants: `CreateRoomSchema`, `CreateSpeakerSchema`, `CreateWorkshopSchema`, `EmergencyUpdateWorkshopSchema`, `ListWorkshopsQuerySchema`, `UpdateRoomSchema`, `UpdateSpeakerSchema`, `UpdateWorkshopSchema` — they are only consumed by `createZodDto()` in the same file. |
| Y3 | Comment in `cancelWorkshop` references future Booking module integration — TODO in production code | `workshops.service.ts:487-490` | Low | Either implement the cross-module call now or move the TODO to an external ticket tracker. |

### 2.3 DRY

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| D1 | Duplicated field mapping logic across 7 methods: snake_case DTO → camelCase DB conversion repeated in `RoomsService`, `SpeakersService`, `WorkshopsService` | `rooms.service.ts`, `speakers.service.ts`, `workshops.service.ts` | Medium | Extract a shared mapper utility function (e.g., `toCamelCase(obj)`) or use a library like `@mily/ts-belt` to reduce duplication. |
| D2 | Duplicated response assembly pattern in `WorkshopsService`: fetching slot/speaker/room data and calling `fromAdminDetail` is repeated in 5 methods (createWorkshop, updateWorkshop, publishWorkshop, emergencyUpdate, cancelWorkshop) | `workshops.service.ts:221-238, 302-320, 373-385, 453-467, 518-534` | Medium | Extract a private helper method `#buildAdminDetailResponse(workshop, slot, speakerName, roomName, availableSeats)` to centralize this logic. |
| D3 | Repository pattern is intentionally consistent — each repo follows same DI approach | Compliant | All repos | — | — |

### 2.4 SOLID

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| S1 | **SRP Violation:** `WorkshopsService` handles 7+ distinct workflows: public listing, admin CRUD, publishing, emergency updates, cancellation, statistics, cron jobs, slot reconciliation | `workshops.service.ts` (entire file) | Medium | Extract cron-related methods (`completePastWorkshops`, `getPublishedWorkshopsBasic`, `reconcileSlot`) to a dedicated `WorkshopCronService` or `WorkshopReconciliationService`. |
| S2 | **DIP:** Repositories depend directly on concrete `DatabaseClient` and `DatabaseSchema` from `@/database` rather than abstractions | All repositories | Low | Acceptable in a Drizzle-based project where DB swap is unlikely. No action needed. |
| S3 | Response builders follow Open/Closed Principle — new DTO shapes can be added without modifying existing methods | Compliant | All response DTOs | — | — |
| S4 | Controllers follow Single Responsibility — each handles one resource, delegates to services | Compliant | All controllers | — | — |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| C1 | Controllers contain no business logic — correctly delegate to services | Compliant | All controllers | — | — |
| C2 | Services contain no HTTP concerns — no `@Res()`, no request/response objects used | Compliant | All services | — | — |
| C3 | **Exception:** `DocumentsAdminController.downloadDocument` breaks the Result pattern by checking `result.isFailure` and throwing `NotFoundException` directly | `documents-admin.controller.ts:146-148` | Medium | Architecturally inconsistent with project convention. This is partially justified for stream responses. Document the exception or refactor stream handling into an interceptor. |
| C4 | Cross-module communication via `SeatCounterService` export — proper Service-to-Service pattern | Compliant | `catalog.module.ts:77` | — | — |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| L1 | No excessive method chaining observed | Compliant | All files | — | — |
| L2 | Object graph navigation is limited to 1-2 levels (e.g., `workshopRow.speakers?.fullName`) | Compliant | All files | — | — |

---

## 3. Strategic Recommendations

### 3.1 Immediate Fixes

1. **🔴 CRITICAL — Missing method `findPublishedBasic()`** (`workshops.service.ts:716`)
   - `WorkshopsService.getPublishedWorkshopsBasic()` calls `this.workshopsRepo.findPublishedBasic()` but the method does not exist in `WorkshopsRepository`.
   - **Action:** Either implement the method in the repository (SELECT workshopId, capacity FROM workshops WHERE status = 'PUBLISHED') or remove the service method if unused.
   - **Impact:** Production error on the first invocation of the background reconciliation cron.

2. **🔴 CRITICAL — Parameter mismatch in `reconcileSlot()` → `reconcile()` call** (`workshops.service.ts:740-744`, `workshop-slots.repository.ts:151`)
   - `reconcileSlot(workshopId, capacity, lockedCount, confirmedCount)` calls `repo.reconcile(workshopId, capacity, lockedCount, confirmedCount)`, but the repo method signature is `reconcile(workshopId, lockedCount, confirmedCount)`.
   - **Parameter mapping is corrupted:** `capacity` is passed as `lockedCount`, `lockedCount` as `confirmedCount`, and `confirmedCount` is silently dropped.
   - **Impact:** Every reconciliation cron run writes wrong counter values to the database, corrupting workshop slot data.
   - **Action:** Fix the service call to: `this.workshopSlotsRepo.reconcile(workshopId, lockedCount, confirmedCount)` (drop `capacity` parameter).

3. **High — Remove dead `aiSummary` parameter from `WorkshopResponseBuilder.fromDetail`**
   - Remove the unused `aiSummary?: any` parameter and its associated `eslint-disable-next-line` comment.

### 3.2 Short-Term Improvements

1. **Refactor `WorkshopsService`** — Extract cron/reconciliation methods into `WorkshopCronService` to reduce SRP violations.
2. **Extract private helper** in `WorkshopsService` for the duplicated response assembly pattern (repeated 5x).
3. **Address `@Res()` usage** in `DocumentsAdminController.downloadDocument` — either document as accepted exception or build a stream interceptor.
4. **Remove redundant `.partial()` or `.optional()`** from `UpdateWorkshopSchema`.
5. **Remove `export` from unused Zod Schema constants** in DTO files.

### 3.3 Long-Term Architecture

1. **Extract cron responsibilities** — Move `@Cron()` decorators out of business services into a dedicated scheduler layer.
2. **Snake_case ↔ camelCase mapping** — Consider a centralized DTO mapping layer to eliminate manual field mapping duplication across all services.
3. **File upload configuration** — Verify and document `memoryStorage` configuration for `FileInterceptor` to ensure uploaded files are not persisted to disk during S3 uploads.
4. **Cross-module cancellation flow** — Implement the TODO in `cancelWorkshop` regarding Booking module registration voiding when the Booking module is fully integrated.
