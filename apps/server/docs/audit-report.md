# Server Audit Report

**Ngày:** 2026-05-02
**Phạm vi:** `apps/server/` — 161 files, ~16,500 LOC, 5 modules
**Phương pháp:** 3 teammate audit song song đối chiếu với 4 nguồn tài liệu thiết kế
**Branch:** `main` (commit `28f48f6`)

---

## Executive Summary

| Severity     | Count  | Trạng thái                       |
| ------------ | ------ | -------------------------------- |
| **Critical** | 7      | 1 đã fix trong PR #25, 6 cần fix |
| **High**     | 7      | 7 cần fix                        |
| **Medium**   | 11     | 11 cần fix                       |
| **Low**      | 5      | 5 cần fix (ưu tiên thấp)         |
| **Total**    | **30** |                                  |

**Kết luận:** Server implementation đạt ~85% spec compliance. Các critical issues tập trung vào 3 nhóm chính: (1) AppModule wiring chưa hoàn chỉnh (đã fix), (2) registration flow bị vỡ do sai JWT field name + QR token format, (3) background cron jobs bypass Repository layer và một số pipeline là placeholder. Không phát hiện lỗ hổng bảo mật nghiêm trọng — guards, IDOR protection, RBAC đều hoạt động đúng.

---

## Section 1: Spec Compliance (spec-verifier-a + spec-verifier-b)

### 1.1 FR Coverage Summary

| Domain                       | FRs Checked | Pass | Violations                                |
| ---------------------------- | ----------- | ---- | ----------------------------------------- |
| F01 — Auth & Token           | 8           | 7    | 1 (WEB refresh cookie)                    |
| F02 — Workshop Management    | 7           | 6    | 1 (AI summary in response)                |
| F03 — Document & AI          | 2           | 0    | 2 (AI pipeline stubs)                     |
| F04 — Registration & Payment | 8           | 4    | 4 (userId, notifications, QR, ticket dup) |
| F05 — Seat Management        | 3           | 3    | 0                                         |
| F06 — Ticket & QR            | 2           | 0    | 2 (UUID, offline verify)                  |
| F07 — Check-in               | 5           | 4    | 1 (scope guard missing)                   |
| F08 — Notifications          | 3           | 2    | 1 (no events emitted)                     |
| F09 — Data Sync              | 4           | 3    | 1 (CSV stub)                              |
| F10 — Background Jobs        | 5           | 2    | 3 (auto-completion missing, cron Drizzle) |

### 1.2 BR Coverage Summary

| Domain                         | BRs Checked | Pass   | Violations |
| ------------------------------ | ----------- | ------ | ---------- |
| Auth & Security (BR-001–015)   | 18          | 16     | 2          |
| Booking & Payment (BR-016–030) | 18          | 14     | 4          |
| Check-in (BR-031–036)          | 6           | 5      | 1          |
| Background (BR-037–042)        | 8           | 5      | 3          |
| **Total**                      | **50**      | **40** | **10**     |

### 1.3 Detailed Findings

#### CRITICAL

| ID        | File:Line                                                                              | Violation                      | Description                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S-C01** | `src/modules/booking/controllers/registrations.controller.ts:46,63`                    | FR-F04-001–006, BR-016–020     | `@CurrentUser()` typed as `{ userId: string }` — JwtPayload field is `sub`, not `userId`. Runtime value is `undefined`. ALL registration flows broken. |
| **S-C02** | `src/modules/booking/services/registrations.service.ts:142-153`                        | BR-035, FR-F04-003–005         | No BullMQ notification events enqueued from registration. REGISTRATION_CONFIRMED and REGISTRATION_CANCELLED never fire.                                |
| **S-C03** | `src/modules/booking/services/registrations.service.ts:148`, `payments.service.ts:315` | AMB-04, FR-F06-001, FR-F07-003 | `qr_token` generated via `crypto.randomUUID()` instead of Signed JWT `{ticket_id, workshop_id, student_id, exp}`. Mobile offline check-in impossible.  |
| **S-C04** | `src/modules/background/`                                                              | FR-F10-005                     | Workshop auto-completion cron (`0 * * * *`) not implemented. No file exists.                                                                           |

#### HIGH

| ID        | File:Line                                                                     | Violation                  | Description                                                                                                                        |
| --------- | ----------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **S-H01** | `src/modules/iam/services/auth.service.ts:80-84` + `auth.controller.ts:37-47` | FR-F01-001, BR-001, BR-002 | No `Set-Cookie` header for WEB refresh token. Web users cannot refresh session.                                                    |
| **S-H02** | `src/modules/background/services/student-sync.service.ts:263`                 | FR-F09-002                 | `parseCSV()` returns `Result.ok([])` — stub. CSV import non-functional.                                                            |
| **S-H03** | `src/modules/background/services/ai-summary.service.ts:134,203`               | FR-F03-002                 | `extractTextFromPdf()` and `callClaudeApi()` return placeholder strings. AI pipeline is no-op.                                     |
| **S-H04** | `src/modules/checkin/controllers/checkin.controller.ts:74,93`                 | BR-005                     | `WorkshopScopeGuard` missing on `syncOfflineData()` and `getWorkshopStatus()`. Check-in staff can operate on unassigned workshops. |
| **S-H05** | `src/modules/background/services/system-monitor.service.ts:73-75`             | OpenAPI spec               | `last_run` returns `now` (current time) instead of tracked actual run timestamps.                                                  |

#### MEDIUM

| ID        | File:Line                                                                                                                                  | Violation                   | Description                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-M01** | `src/core/guards/jwt-auth.guard.ts:82`                                                                                                     | Auth-guards spec            | Uses raw `jwt.verify()` instead of `TokenService.verifyAccessToken()`. Duplicates verification logic.                                                                                                                                                                                                                                     |
| **S-M02** | `src/modules/catalog/dto/workshop-response.dto.ts:86-101`                                                                                  | FR-F02-007, AI Summary spec | `WorkshopDetailDto.fromDetail()` accepts `aiSummary` parameter but discards it. AI summary never reaches client.                                                                                                                                                                                                                          |
| **S-M03** | `src/modules/catalog/dto/workshop-response.dto.ts:120-141`                                                                                 | AI Summary spec             | `WorkshopAdminDetailDto` missing `ai_summary` with `error_message` and `document_id` for FAILED status.                                                                                                                                                                                                                                   |
| **S-M04** | `src/modules/booking/services/registrations.service.ts:144-148`, `payments.service.ts:312-319`, `checkin/services/ticket.service.ts:27-31` | DRY                         | Ticket creation code duplicated in 3 places. `issueTicket()` in ticket.service appears unused/dead code.                                                                                                                                                                                                                                  |
| **S-M05** | `src/modules/checkin/dto/offline-sync.dto.ts:8`                                                                                            | OpenAPI spec                | Field name `timestamp` vs OpenAPI `checked_in_at`. Mobile-server field mismatch.                                                                                                                                                                                                                                                          |
| **S-M06** | `docs/openapi.yaml:162-202` vs `shared/response/types.ts:52-65`                                                                            | OpenAPI spec                | 10 error codes exist in codebase but not in OpenAPI ErrorCode enum: `UPLOAD_FAILED`, `DELETE_FAILED`, `NOTIFICATION_LOG_NOT_FOUND`, `NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND`, `NOTIFICATION_CHANNEL_INACTIVE`, `NOTIFICATION_CHANNEL_UNKNOWN`, `STORAGE_DOWNLOAD_FAILED`, `STORAGE_FILE_NOT_FOUND`, `ROOM_NOT_FOUND`, `SPEAKER_NOT_FOUND`. |
| **S-M07** | `src/modules/checkin/services/offline-sync.service.ts:42`                                                                                  | BR-034                      | Sequential item-by-item processing instead of `INSERT ON CONFLICT DO NOTHING` batch insert.                                                                                                                                                                                                                                               |

#### LOW

| ID        | File:Line                                                     | Violation         | Description                                                                                           |
| --------- | ------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| **S-L01** | `src/modules/catalog/services/workshops.service.ts:349-351`   | FR-F02-003        | Error code `WORKSHOP_NOT_PUBLISHED` returned for already-PUBLISHED workshop. Semantically misleading. |
| **S-L02** | `src/modules/booking/controllers/registrations.controller.ts` | Naming convention | Bare `@Controller()` without base path prefix (other controllers use explicit paths).                 |
| **S-L03** | `src/modules/checkin/services/ticket.service.ts:27`           | Dead code         | `issueTicket()` method unused and missing crypto import — would throw at runtime if called.           |

---

## Section 2: Architecture & Security (arch-sec-reviewer)

### 2.1 Category Summary

| Category             | Checks | Pass   | Fail  |
| -------------------- | ------ | ------ | ----- |
| Module Wiring        | 6      | 3      | 3     |
| Layered Architecture | 8      | 7      | 1     |
| Guards               | 5      | 5      | 0     |
| IDOR Protection      | 6      | 6      | 0     |
| Safety Mechanisms    | 5      | 4      | 1     |
| Response Interceptor | 4      | 4      | 0     |
| NFR Compliance       | 3      | 1      | 2     |
| Naming Convention    | 20     | 20     | 0     |
| **Total**            | **57** | **50** | **7** |

### 2.2 Detailed Findings

#### CRITICAL

| ID        | File:Line                                                                        | Violation                                     | Description                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-C01** | `src/app.module.ts:17-33`                                                        | 01-architecture.md §Module Boundaries, ADR-01 | AppModule only imports IamModule and CatalogModule. BookingModule, CheckinModule, BackgroundModule not registered. All controllers in missing modules unreachable. **Note: Fixed in PR #25 (`feat/cross-module-integration`).** |
| **A-C02** | `src/modules/background/cron/payment-timeout.cron.ts:33-38,54-62`                | layered-architecture.md §Anti-Pattern #4      | Injects DATABASE_CONNECTION and DATABASE_SCHEMA directly. Runs raw Drizzle queries bypassing Repository + Result pattern.                                                                                                       |
| **A-C03** | `src/modules/background/cron/reconciliation.cron.ts:39-44,62-67,118-126,143-158` | layered-architecture.md §Anti-Pattern #4      | Same violation as A-C02. Raw Drizzle queries at 4 locations bypassing repositories.                                                                                                                                             |

#### HIGH

| ID        | File:Line                                                  | Violation                           | Description                                                                                                                                           |
| --------- | ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-H01** | `src/modules/booking/mechanics/rate-limiter.mechanic.ts:9` | 04-safety-mechanisms.md §Thresholds | `REFILL_INTERVAL_MS = 10_000` (1 token/10s) vs spec `1 token/second`. 10x slower than designed.                                                       |
| **A-H02** | `src/main.ts:17`                                           | srs.md §6.4 NFR Security            | No TLS/HTTPS configuration. Uses `helmet()` but no `https.createServer()` or SSL cert configuration. Relies on undocumented reverse proxy assumption. |

#### MEDIUM

| ID        | File:Line                                                        | Violation                                  | Description                                                                                                                |
| --------- | ---------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **A-M01** | `src/modules/catalog/catalog.module.ts:37`                       | ADR-01                                     | Duplicate `ScheduleModule.forRoot()` — also registered in BackgroundModule. Should only exist in root or BackgroundModule. |
| **A-M02** | `src/modules/background/repositories/ai-summaries.repository.ts` | DRY, layered-architecture.md §Cross-Module | Near-identical copy of `catalog/repositories/ai-summaries.repository.ts`. Diff shows only comment header differences.      |
| **A-M03** | (none — config gap)                                              | srs.md §6.4 NFR Reliability                | Redis AOF persistence (`everysec`) not configured in code. Relies on external config not documented.                       |

#### LOW

| ID        | File:Line                                                       | Violation                             | Description                                                                                                                            |
| --------- | --------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A-L01** | `src/modules/booking/mechanics/global-rate-limit.mechanic.ts:8` | 04-safety-mechanisms.md §Token Bucket | Fixed window (INCR + EXPIRE 1) instead of Token Bucket algorithm. Design doc itself identifies this as "burst at boundary" vulnerable. |

### 2.3 Verified Correct

- **Guards:** JwtAuthGuard blacklist check (`token:blacklist:{jti}`), RolesGuard RBAC enforcement, WorkshopScopeGuard `allowed_workshop_ids`, HmacSignatureGuard HMAC-SHA256 validation
- **IDOR:** All student-facing queries enforce `WHERE student_id = jwt.sub`. `@CurrentUser()` used consistently (except bug S-C01)
- **Circuit Breaker:** CLOSED→OPEN (5 failures)→HALF_OPEN (30s)→CLOSED — matches BR-025
- **Idempotency:** Redis SET NX (Layer 1, TTL 86400) + DB UNIQUE constraint (Layer 2)
- **Seat Lock:** SET NX with TTL=900s
- **Response Interceptor:** OkResult→200/201, FailResult→appropriate HTTP codes via `categoryToStatus`
- **Naming:** All classes follow `[Resource][Role]Suffix`, all files kebab-case with layer suffix, all functions camelCase with CQS prefix

---

## Section 3: Test Coverage (test-writer)

### 3.1 Coverage Summary

**Trước audit:** ~5 spec files (app.controller.spec.ts + minimal)

**Sau audit:** 48 spec files covering all 5 modules

| Module         | Service Tests                                                                                  | Repository Tests                                                                                          | Mechanic Tests                                                               | Total  |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| **iam**        | 5 (auth, token, users, student-profile, checkin-staff-assignment)                              | 3 (users, students, checkin-staff-assignments)                                                            | —                                                                            | 8      |
| **catalog**    | 7 (workshops, rooms, speakers, documents, seat-counter, room-conflict, notification-publisher) | 6 (workshops, rooms, speakers, workshop-documents, workshop-slots, ai-summaries)                          | —                                                                            | 13     |
| **booking**    | 3 (registrations, payments, payment-gateway)                                                   | 3 (registrations, payments, tickets)                                                                      | 5 (seat-lock, rate-limiter, global-rate-limit, idempotency, circuit-breaker) | 11     |
| **checkin**    | 3 (checkin, ticket, offline-sync)                                                              | 2 (checkin-records, tickets)                                                                              | —                                                                            | 5      |
| **background** | 5 (notifications, notification-dispatch, ai-summary, student-sync, system-monitor)             | 5 (ai-summaries, notification-channel-configs, notification-logs, student-sync-errors, student-sync-jobs) | —                                                                            | 10     |
| **root**       | 1 (app.controller)                                                                             | —                                                                                                         | —                                                                            | 1      |
| **Total**      | **24**                                                                                         | **19**                                                                                                    | **5**                                                                        | **48** |

### 3.2 Test Quality

- All tests follow Result pattern: both `ok()` and `fail()` paths tested
- Drizzle mocked via `mockDeep()`, Redis via `ioredis-mock`
- Each file references specific FR Acceptance Criteria from docs/srs.md
- Coverage gaps noted: integration tests (controller + real service) and e2e tests (supertest) not yet written — planned for Phase 2

---

## Appendix A: Master Finding List (sorted by severity → file)

### CRITICAL (7)

| ID    | Source   | File                                                    | Clause                                  |
| ----- | -------- | ------------------------------------------------------- | --------------------------------------- |
| A-C01 | arch-sec | `app.module.ts:17-33`                                   | 01-architecture.md — Fixed in PR #25    |
| A-C02 | arch-sec | `background/cron/payment-timeout.cron.ts:33-38`         | layered-architecture.md Anti-Pattern #4 |
| A-C03 | arch-sec | `background/cron/reconciliation.cron.ts:39-44`          | layered-architecture.md Anti-Pattern #4 |
| S-C01 | spec-b   | `booking/controllers/registrations.controller.ts:46,63` | FR-F04-001–006                          |
| S-C02 | spec-b   | `booking/services/registrations.service.ts:142-153`     | BR-035, FR-F04-003–005                  |
| S-C03 | spec-b   | `booking/services/registrations.service.ts:148`         | AMB-04, FR-F06-001                      |
| S-C04 | spec-b   | `background/` (missing file)                            | FR-F10-005                              |

### HIGH (7)

| ID    | Source   | File                                                  | Clause                  |
| ----- | -------- | ----------------------------------------------------- | ----------------------- |
| A-H01 | arch-sec | `booking/mechanics/rate-limiter.mechanic.ts:9`        | 04-safety-mechanisms.md |
| A-H02 | arch-sec | `main.ts:17`                                          | srs.md §6.4             |
| S-H01 | spec-a   | `iam/services/auth.service.ts:80-84`                  | FR-F01-001, BR-001/002  |
| S-H02 | spec-b   | `background/services/student-sync.service.ts:263`     | FR-F09-002              |
| S-H03 | spec-b   | `background/services/ai-summary.service.ts:134,203`   | FR-F03-002              |
| S-H04 | spec-b   | `checkin/controllers/checkin.controller.ts:74,93`     | BR-005                  |
| S-H05 | spec-b   | `background/services/system-monitor.service.ts:73-75` | OpenAPI spec            |

### MEDIUM (11)

| ID    | Source   | File                                                 | Clause                 |
| ----- | -------- | ---------------------------------------------------- | ---------------------- |
| A-M01 | arch-sec | `catalog/catalog.module.ts:37`                       | ADR-01                 |
| A-M02 | arch-sec | `background/repositories/ai-summaries.repository.ts` | DRY                    |
| A-M03 | arch-sec | (config)                                             | srs.md §6.4            |
| S-M01 | spec-a   | `core/guards/jwt-auth.guard.ts:82`                   | auth-guards spec       |
| S-M02 | spec-a   | `catalog/dto/workshop-response.dto.ts:86-101`        | FR-F02-007             |
| S-M03 | spec-a   | `catalog/dto/workshop-response.dto.ts:120-141`       | AI Summary spec        |
| S-M04 | spec-b   | `booking/services/registrations.service.ts:144-148`  | DRY                    |
| S-M05 | spec-b   | `checkin/dto/offline-sync.dto.ts:8`                  | OpenAPI spec           |
| S-M06 | spec-b   | `docs/openapi.yaml:162-202`                          | OpenAPI ErrorCode enum |
| S-M07 | spec-b   | `checkin/services/offline-sync.service.ts:42`        | BR-034                 |

### LOW (5)

| ID     | Source   | File                                                | Clause                  |
| ------ | -------- | --------------------------------------------------- | ----------------------- |
| A-L01  | arch-sec | `booking/mechanics/global-rate-limit.mechanic.ts:8` | 04-safety-mechanisms.md |
| S-L01  | spec-a   | `catalog/services/workshops.service.ts:349-351`     | FR-F02-003              |
| S-L02  | spec-b   | `booking/controllers/registrations.controller.ts`   | naming                  |
| S-L03  | spec-b   | `checkin/services/ticket.service.ts:27`             | dead code               |
| (none) | spec-a   | `catalog/services/workshops.service.ts:349-351`     | FR-F02-003              |

---

## Appendix B: Fix Priority Matrix

| Priority             | IDs                                                    | Estimated Effort | Impact                                                |
| -------------------- | ------------------------------------------------------ | ---------------- | ----------------------------------------------------- |
| **P0 — Immediate**   | S-C01, S-C03, A-C02, A-C03                             | 4-6h             | Registration flow broken, QR broken, cron reliability |
| **P1 — This Sprint** | S-C02, S-C04, S-H01, S-H02, S-H03, S-H04, A-H01, A-H02 | 8-12h            | Notification pipeline, AI pipeline, security gaps     |
| **P2 — Next Sprint** | S-M01–S-M07, A-M01–A-M03                               | 6-8h             | Code quality, spec sync, configuration                |
| **P3 — Backlog**     | S-L01–S-L03, A-L01                                     | 2-3h             | Minor semantic issues, naming polish                  |

---

## Appendix C: Test Coverage Map

```
apps/server/src/
├── modules/
│   ├── iam/
│   │   ├── services/     [5/5 tested] ✅ auth, token, users, student-profile, checkin-staff-assignment
│   │   └── repositories/ [3/3 tested] ✅ users, students, checkin-staff-assignments
│   ├── catalog/
│   │   ├── services/     [7/7 tested] ✅ workshops, rooms, speakers, documents, seat-counter, room-conflict, workshop-notification-publisher
│   │   └── repositories/ [6/6 tested] ✅ workshops, rooms, speakers, workshop-documents, workshop-slots, ai-summaries
│   ├── booking/
│   │   ├── services/     [3/3 tested] ✅ registrations, payments, payment-gateway
│   │   ├── mechanics/    [5/5 tested] ✅ seat-lock, rate-limiter, global-rate-limit, idempotency, circuit-breaker
│   │   └── repositories/ [3/3 tested] ✅ registrations, payments, tickets
│   ├── checkin/
│   │   ├── services/     [3/3 tested] ✅ checkin, ticket, offline-sync
│   │   └── repositories/ [2/2 tested] ✅ checkin-records, tickets
│   └── background/
│       ├── services/     [5/5 tested] ✅ notifications, notification-dispatch, ai-summary, student-sync, system-monitor
│       └── repositories/ [5/5 tested] ✅ ai-summaries, notification-channel-configs, notification-logs, student-sync-errors, student-sync-jobs
└── app.controller.spec.ts [1/1] ✅
```

---

## Appendix D: Spec Doc Updates (2026-05-02)

| Finding   | Resolution                                                                                                                                                                                    | Documents Updated                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A-H01** | **False positive.** `REFILL_INTERVAL_MS = 10_000` là 1 token/10s, nhưng OpenSpec registration-load-control và SRS BR-016 đều ghi 1 token/giây. Code đã fix về 1_000 (1 token/s) trong PR #26. | `docs/blueprint/data/redis-keys.md` (fix refill rate), `docs/srs.md` BR-016 (fix refill rate) |
| **A-M03** | Redis AOF persistence requirement đã được thêm vào blueprint storage strategy                                                                                                                 | `docs/blueprint/design/02-storage-strategy.md` (subsection mới)                               |
| **S-M06** | 10 error codes thiếu trong OpenAPI ErrorCode enum đã được thêm                                                                                                                                | `docs/openapi.yaml` ErrorCode enum                                                            |
| **S-M05** | Field name `timestamp` trong offline-sync DTO khác với OpenAPI `checked_in_at`. Cần fix code DTO.                                                                                             | Ghi nhận — chưa sửa (code change)                                                             |
| **S-M02** | `WorkshopDetailDto.fromDetail()` bỏ qua `aiSummary` param do blueprint chưa spec chi tiết.                                                                                                    | `docs/blueprint/specs/workshop-management.md` (spec mới)                                      |
| **S-M03** | `WorkshopAdminDetailDto` thiếu ai_summary error_message/document_id                                                                                                                           | `docs/blueprint/specs/workshop-management.md` (spec mới)                                      |

**Internal blueprint conflicts resolved:**

- Rate limit refill rate: `04-safety-mechanisms.md` 1 token/giây (đúng) vs `redis-keys.md` 1 token/10 giây (sai) → đã đồng bộ
- Circuit breaker trip condition: `04-safety-mechanisms.md` dùng percentage >50% vs `redis-keys.md` count-based 5 failures/60s → đã đồng bộ về count-based
- ADR numbering: duplicate ADR 05 + duplicate SeatLock ADR 07 → đã gộp và đánh số lại

**Blueprint coverage expanded (Phase 4):**

- Thêm 3 spec files mới: `workshop-management.md`, `registration.md`, `background-jobs.md`
- Cập nhật 3 spec files hiện có: `auth.md`, `payment.md`, `checkin-offline.md`
- Backfill 4 design docs với implementation patterns từ OpenSpec (Result Pattern, guards, Error Factory, Redis keys)
- Chuẩn hóa `openspec/specs/`: 3 flat-file specs → directory format `spec-name/spec.md`

---

## Appendix E: Resolved Findings (2026-05-02 — Branch `docs/sync-specs-and-fix-audit`)

| Finding   | Severity | Resolution                                                                                                                                                                                                                             | Files Changed                                                                    |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **S-H01** | HIGH     | **Already fixed.** `auth.controller.ts` already sets HttpOnly cookie for WEB refresh token in both `login()` and `refresh()`. False positive — checkin confirmed cookie implemented per spec.                                          | —                                                                                |
| **A-M01** | MEDIUM   | **Already fixed.** `catalog.module.ts` no longer has duplicate `ScheduleModule.forRoot()`. Only BackgroundModule registers it.                                                                                                         | —                                                                                |
| **A-M02** | MEDIUM   | **Already fixed.** Only 1 `ai-summaries.repository.ts` exists in `catalog/`. Background module does not duplicate it.                                                                                                                  | —                                                                                |
| **S-H04** | HIGH     | **Fixed.** Added `@UseGuards(WorkshopScopeGuard)` to `syncOfflineData()` and `getWorkshopStatus()` in `checkin.controller.ts`.                                                                                                         | `checkin.controller.ts`                                                          |
| **S-H05** | HIGH     | **Fixed.** Cron jobs (`PaymentTimeoutCron`, `ReconciliationCron`) now save `last_run` timestamp to Redis after completion. `SystemMonitorService` reads from Redis instead of returning `new Date()`.                                  | `payment-timeout.cron.ts`, `reconciliation.cron.ts`, `system-monitor.service.ts` |
| **S-M01** | MEDIUM   | **Design decision — wont fix.** `JwtAuthGuard` in `core/guards/` cannot import `TokenService` from `iam/` per layered-architecture rules. Direct `jwt.verify()` in guard layer is the correct pattern for framework-level auth checks. | —                                                                                |
| **S-M05** | MEDIUM   | **Fixed.** Renamed field `timestamp` → `checked_in_at` in `OfflineSyncSchema` to match OpenAPI spec. Updated `offline-sync.service.ts` references.                                                                                     | `offline-sync.dto.ts`, `offline-sync.service.ts`                                 |
| **S-M07** | MEDIUM   | **Partially addressed.** Per-item validation (ticket status, ownership) requires sequential processing. The `create()` method already uses `ON CONFLICT DO NOTHING` for idempotency. Future optimization: pre-validate + batch insert. | —                                                                                |
| **S-L01** | LOW      | **Fixed.** Added `WORKSHOP_ALREADY_PUBLISHED` error code. `publishWorkshop()` now returns `WORKSHOP_ALREADY_PUBLISHED` when workshop is already published (was `WORKSHOP_NOT_PUBLISHED` — semantically wrong).                         | `types.ts`, `errors.ts`, `workshops.service.ts`                                  |
| **S-L02** | LOW      | **Wont fix.** Controller serves routes under 2 top-level paths (`/registrations` and `/students/me/registrations`), making a shared `@Controller()` prefix impossible. Explicit full paths in each endpoint is the correct pattern.    | —                                                                                |
| **S-L03** | LOW      | **Fixed.** Removed dead `issueTicket()` method from `ticket.service.ts` (unused, used deprecated UUID QR format).                                                                                                                      | `ticket.service.ts`                                                              |
| **A-L01** | LOW      | **Design trade-off — deferred.** Global rate limit uses fixed window (INCR + EXPIRE). Token Bucket would be ideal but adds Redis complexity for a global counter. Already documented in design doc as acceptable trade-off.            | —                                                                                |

---

## Sign-off

| Role                                             | Teammate          | Status                      |
| ------------------------------------------------ | ----------------- | --------------------------- |
| Spec Compliance (IAM + Catalog)                  | spec-verifier-a   | ✅ Complete                 |
| Spec Compliance (Booking + Checkin + Background) | spec-verifier-b   | ✅ Complete                 |
| Architecture & Security                          | arch-sec-reviewer | ✅ Complete                 |
| Test Coverage & Unit Tests                       | test-writer       | ✅ Complete (48 spec files) |
| Consolidation & Report                           | team-lead         | ✅ Complete                 |
