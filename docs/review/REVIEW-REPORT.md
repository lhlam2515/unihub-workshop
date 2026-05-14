# System Review Report — UniHub Workshop

**Date:** 2026-05-13  
**Scope:** 11 User Flows | 3 actor | Static + Dynamic review  
**Reviewer:** Claude Code (Sonnet 4.6)

---

## Test Suite Results

### Unit Tests (apps/server)

```
Test Suites: 6 failed, 44 passed — 50 total
Tests:       15 failed, 596 passed — 611 total
```

**Failing suites:**

- `src/modules/iam/services/auth.service.spec.ts`
- `src/modules/catalog/services/workshops.service.spec.ts`
- `src/modules/booking/services/registrations.service.spec.ts`
- `src/modules/booking/repositories/registrations.repository.spec.ts`
- `src/modules/notification/services/notifications.service.spec.ts`
- `src/modules/iam/guards/roles.guard.spec.ts`

### Integration Tests (apps/server)

```
Test Suites: 2 failed, 4 passed — 6 total
Tests:       11 failed, 104 passed — 115 total
Time:        7.975s
```

### Type Check

| App | Status | Errors |
|-----|--------|--------|
| server | ✅ PASS | 0 |
| web | ✅ PASS | 0 |
| mobile | ❌ FAIL | 8 errors |

---

## 🔴 Tier 1 — Critical Flows

### F2 · Đăng ký Workshop Miễn Phí

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Idempotency | ✅ | `IdempotencyMechanic.check()` với 3 states (IN_PROGRESS/COMPLETED/UNRESOLVED) | `booking/services/registrations.service.ts:80` |
| Spec Compliance — OL retry | ✅ | `MAX_RETRIES = 1` (2 attempts tổng), retry khi `__versionConflict` | `booking/services/registrations.service.ts:141` |
| Spec Compliance — Cache pre-filter | ✅ | `getCachedSeats()` TTL 10s trước khi chạm DB | `booking/services/registrations.service.ts` (Stage 2) |
| Spec Compliance — Duplicate check | ✅ | `findByStudentAndWorkshop` trước OL loop | `booking/services/registrations.service.ts` (Stage 3) |
| Spec Compliance — QR generation | ✅ | `qrCode: crypto.randomUUID()` khi INSERT | `booking/services/registrations.service.ts:186` |
| Spec Compliance — Notification async | ✅ | `void this.notificationLogProducer.createAndEnqueue(...)` sau commit | `booking/services/registrations.service.ts:275` |
| Concurrency — Atomic seat | ✅ | PostgreSQL `WHERE version = ?` bảo đảm OL; Redis chỉ là pre-filter | `catalog/services/seat-counter.service.ts` |
| Concurrency — TOCTOU | ✅ | Cache read → DB read → OL UPDATE trong 1 transaction | Repo + Service |
| Error Handling | ✅ | `SEAT_UNAVAILABLE`, `REGISTRATION_DUPLICATE` đúng spec | `shared/response/errors.ts` |
| Error Handling — Result pattern | ✅ | Không throw trong service; toàn bộ dùng `Result.ok/fail` | Toàn module |
| Test Coverage — Happy path | ✅ | Có test | `booking/services/registrations.spec.ts` |
| Test Coverage — Paid PENDING | ⚠️ | Test expect 4 args `(ws, reg, stu, price)` nhưng mock nhận 3 | `booking/services/registrations.service.spec.ts` |

**Action items F2:**

- `⚠️` Unit test `register paid workshop` fail do signature mismatch — kiểm tra xem service có truyền `price` vào mock không

---

### F3 · Đăng ký Workshop Có Phí

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Thứ tự ①②③ | ❌ | `registrationsRepo.findById` gọi tại line 118, **TRƯỚC** idempotency (line 132) và CB (line 152). Spec: ① Idempotency → ② CB → ③ findById | `payment/services/payments.service.ts:118` |
| Spec Compliance — Idempotency | ✅ | Mechanic đúng 3 states, SHA-256 hash key | `payment/mechanics/idempotency.mechanic.ts` |
| Spec Compliance — CB check | ✅ | `CircuitBreakerMechanic` in-memory (đúng ADR-07), threshold 5 failures OR 50% rate | `payment/mechanics/circuit-breaker.mechanic.ts` |
| Spec Compliance — CB HALF_OPEN | ✅ | HALF_OPEN → reject; OPEN+cooldown 30s → HALF_OPEN canary; 2 success → CLOSED | `payment/mechanics/circuit-breaker.mechanic.ts` |
| Spec Compliance — TIMEOUT → UNRESOLVED | ✅ | `markUnresolved()` khi gateway timeout | `payment/services/payments.service.ts:187` |
| Spec Compliance — Reconciliation | ✅ | Cron job `payment-reconciliation.cron.ts` xử lý UNRESOLVED | `background/cron/` |
| Concurrency — Seat lock | ✅ | `SeatLockMechanic` Redis TTL 15min | `booking/mechanics/seat-lock.mechanic.ts` |
| Error Handling — initiatedAt null | ❌ | `payment.initiatedAt.toISOString()` crash khi `initiated_at` null trong DB | `payment/dto/payment-response.dto.ts:51` |
| Error Handling — PAYMENT_GATEWAY_OPEN | ❌ | Integration test fail: CB check không được reach do `findById` gọi trước | `test/integration/booking.integration.spec.ts:674` |
| Test Coverage — CB OPEN | ❌ | Integration test `PAYMENT_GATEWAY_OPEN` FAIL vì ordering bug | `test/integration/booking.integration.spec.ts:658` |
| Test Coverage — TIMEOUT path | ⚠️ | Test UNRESOLVED path chưa xác nhận riêng | |

**Bugs F3:**

- `❌ BUG-01` — Sai thứ tự pipeline: `findById` line 118 phải được move XUỐNG sau bước CB check (line 152). Spec §2 Phase B: ① Idempotency → ② CB → ③ Claim key → sau đó mới lookup registration
- `❌ BUG-02` — `PaymentResponseBuilder.from()`: `payment.initiatedAt` có thể null, thiếu guard `.toISOString()`. Fix: `payment.initiatedAt?.toISOString() ?? new Date().toISOString()`
- `❌ BUG-03` — Integration test fail theo cascade từ BUG-01

---

### F10 · Check-in Online

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — RBAC | ✅ | `@Roles("CHECKIN_STAFF")` trên controller | `checkin/controllers/checkin.controller.ts` |
| Spec Compliance — WorkshopScopeGuard | ✅ | Guard đọc `allowed_workshop_ids` từ JWT, extract `workshop_id` từ params/body | `iam/guards/workshop-scope.guard.ts` |
| Spec Compliance — ON CONFLICT DO NOTHING | ✅ | Repository dùng idempotent insert | `checkin/repositories/checkin-records.repository.ts` |
| Spec Compliance — Duplicate response | ✅ | `rowsAffected = 0` → trả thông tin check-in lần trước | `checkin/services/checkin.service.ts` |
| Error Handling — TICKET_NOT_FOUND | ✅ | Các error code đúng spec | `shared/response/errors.ts` |
| Error Handling — Scope denied | ✅ | `ForbiddenException` khi workshop không trong scope | `iam/guards/workshop-scope.guard.ts` |
| Test Coverage — Controller spec | ⚠️ | `checkin.controller.ts` **không có** `.spec.ts` tương ứng | `checkin/controllers/` |

**Action items F10:**

- `⚠️` Thêm unit test cho `CheckinController` — hiện chỉ có service spec

---

### F11 · Check-in Offline + Sync

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Server — Preload endpoint | ✅ | `GET /checkins/workshops/:id/registrations` trả cache cho mobile | `checkin/controllers/` |
| Server — POST /sync batch | ✅ | `OfflineSyncService.processSyncBatch()` xử lý từng item, partial success | `checkin/services/offline-sync.service.ts` |
| Server — Idempotency sync | ✅ | `ON CONFLICT (registration_id) DO NOTHING`, trả `result: "ok" / "duplicate" / "rejected"` | `checkin/repositories/checkin-records.repository.ts` |
| Mobile — expo-crypto missing | ❌ | `expo-crypto` được import nhưng **không có trong dependencies** | `mobile/src/app/_layout.tsx:11`, `use-scan.ts:2` |
| Mobile — allowedWorkshopIds naming | ❌ | `use-auth.ts` dùng `payload.allowedWorkshopIds` (camelCase) nhưng `UniHubJwtPayload` định nghĩa `allowed_workshop_ids` (snake_case) | `mobile/src/features/auth/hooks/use-auth.ts:63,74,75` |
| Mobile — SafeAreaView not imported | ❌ | `SafeAreaView` được dùng tại line 91, 130 nhưng không có import | `mobile/src/app/workshop/[id]/scan.tsx:91,130` |
| Mobile — ApiResponse.meta missing | ❌ | `parseResponse` cho 204 trả `{ success: true, data }` nhưng `ApiResponse<T>` require `meta: RequestMeta` | `mobile/src/lib/api/client/http.ts` |
| Mobile — profile.tsx naming | ❌ | `session.allowedWorkshopIds` thay vì `session.allowed_workshop_ids` | `mobile/src/app/(tabs)/profile.tsx:92` |

**Bugs F11 (Mobile — build fail hoàn toàn):**

- `❌ BUG-04` — `expo-crypto` not found: chạy `pnpm add expo-crypto` trong `apps/mobile`
- `❌ BUG-05` — Naming inconsistency: đổi `payload.allowedWorkshopIds` → `payload.allowed_workshop_ids` trong `use-auth.ts` và `session.allowedWorkshopIds` → `session.allowed_workshop_ids` trong `profile.tsx`
- `❌ BUG-06` — `SafeAreaView`: add `import { SafeAreaView } from 'react-native-safe-area-context'` vào `scan.tsx`
- `❌ BUG-07` — `ApiResponse.meta` cho 204: mobile `http.ts` `parseResponse` trả `{ success: true, data: undefined as T }` nhưng thiếu `meta`. Hoặc sửa `parseResponse` để include `meta`, hoặc điều chỉnh type để `meta` optional trên 204 response

---

## 🟡 Tier 2 — High Flows

### F1 · Duyệt Danh Sách Workshop

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Seat counter TTL 10s | ✅ | `SeatCounterService.getCachedSeats()`: cache `EX 10`, fallback đọc DB | `catalog/services/seat-counter.service.ts` |
| Spec Compliance — Status display | ✅ | `OPEN / CANCELLED / COMPLETED / DRAFT` enum có | Schema |
| Spec Compliance — Filter | ⚠️ | Filter theo ngày và chủ đề chưa xác nhận đầy đủ trong public endpoint | `catalog/controllers/workshops-public.controller.ts` |
| Spec Compliance — AI Summary hiển thị | ✅ | `summary_text`, `summary_status` trong schema workshop | DB Schema |

---

### F4 · Xem QR và Lịch Đăng Ký Cá Nhân

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — QR là UUID random | ✅ | `qr_code = crypto.randomUUID()` (không phải `registration.id`) | `booking/services/registrations.service.ts:186` |
| Spec Compliance — IDOR prevention | ✅ | `GET /registrations/:id` kiểm tra `student_id = jwt.sub`, trả 404 (không 403) | `booking/services/registrations.service.ts`, spec authorization §4.2 |
| Spec Compliance — Status display | ✅ | `PENDING/CONFIRMED/PAID/CANCELLED` có trong response DTO | `booking/dto/registration-response.dto.ts` |
| Test Coverage | ✅ | Repository spec có test IDOR | `booking/repositories/registrations.repository.spec.ts` |

---

### F7 · Upload PDF → AI Summary

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — BullMQ queue | ✅ | `@Processor(AI_SUMMARY_QUEUE)`, `concurrency: 1` | `background/workers/ai-summary.worker.ts` |
| Spec Compliance — Retry 3 lần | ✅ | Configured via `defaultJobOptions`, exponential backoff 10/20/40s | `background/workers/ai-summary.worker.ts` |
| Spec Compliance — LLM timeout | ✅ | `withTimeout(promise, 40_000)` — 40s timeout, LLM_TIMEOUT là terminal (no retry) | `background/workers/ai-summary.worker.ts` |
| Spec Compliance — AI API error | ✅ | Non-timeout errors throw → trigger BullMQ retry | `background/workers/ai-summary.worker.ts` |
| Test Coverage | ⚠️ | Không tìm thấy `.spec.ts` cho `AiSummaryWorker` hoặc `AiSummaryService` | `background/workers/` |

---

### F8 · Import CSV Sinh Viên

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Upsert | ✅ | `INSERT ON CONFLICT (student_id) DO UPDATE` batch 500 rows | `csv-sync/services/student-sync.service.ts` (delegated) |
| Spec Compliance — Không xóa cũ | ✅ | Chỉ INSERT/UPDATE, không DELETE | Schema |
| Spec Compliance — Distributed lock | ✅ | Redis `SET NX` lock, skip nếu job đang chạy | `background/workers/student-sync.worker.ts` |
| Spec Compliance — Notify BTC | ✅ | `notifyBtcUsers()` khi `errorRows > 0` | `background/workers/student-sync.worker.ts` |
| Spec Compliance — Báo cáo admin | ⚠️ | Error file URL hardcoded: `/admin/imports/errors/{date}` — chưa xác nhận endpoint này tồn tại | `background/workers/student-sync.worker.ts` |
| Test Coverage | ⚠️ | Không tìm thấy `.spec.ts` cho `StudentSyncWorker` | `background/workers/` |

---

## 🟢 Tier 3 — Medium Flows

### F5 · Tạo Workshop Mới

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — RBAC BTC | ✅ | `@Roles("BTC")` ở class level controller | `catalog/controllers/workshops-admin.controller.ts:47` |
| Spec Compliance — Room conflict | ✅ | `RoomConflictService` validate before create/publish | `catalog/services/room-conflict.service.ts` |
| Spec Compliance — version=0, seats=capacity | ✅ | Schema default + service logic | `catalog/services/workshops.service.ts` |
| Spec Compliance — Publish separate step | ✅ | `POST /admin/workshops/:id/publish` riêng biệt | `catalog/controllers/workshops-admin.controller.ts:136` |
| Test Coverage | ⚠️ | `WorkshopsService.cancelWorkshop` spec fail — notification log expectation mismatch | `catalog/services/workshops.service.spec.ts` |

---

### F6 · Cập Nhật / Hủy Workshop

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Cancel status | ✅ | `updateStatus(id, "CANCELLED")`, xóa Redis seat counter | `catalog/services/workshops.service.ts:469` |
| Spec Compliance — Notification cancel | ✅ | `publishCancelled()` → BullMQ, fire-and-forget | `catalog/services/workshops.service.ts:476` |
| Spec Compliance — Emergency update | ✅ | `PATCH /admin/workshops/:id/emergency-update`, trigger `publishEmergencyUpdate()` | `catalog/controllers/workshops-admin.controller.ts:157` |
| Spec Compliance — Refund paid workshops | ❌ | **Không có** trigger hoàn tiền khi hủy workshop có phí. Cancel flow chỉ: updateStatus + notify | `catalog/services/workshops.service.ts:447-490` |
| Test Coverage | ❌ | `cancelWorkshop` unit test fail — expected notification log call signature không khớp | `catalog/services/workshops.service.spec.ts` |

**Gap F6:**

- `❌ GAP-01` — **Refund không implement**: Spec F6 nói "Workshop có phí + hủy → trigger hoàn tiền cho tất cả người đã đăng ký". Implementation hiện tại: không có refund call. Cần implement hoặc document đây là out-of-scope MVP.

---

### F9 · Xem Thống Kê Đăng Ký

| Chiều | Status | Chi tiết | File:Line |
|-------|--------|---------|-----------|
| Spec Compliance — Workshop stats | ✅ | `GET /admin/workshops/:id/stats` → `confirmed_count, locked_count, available_seats, total_capacity` | `catalog/controllers/workshops-admin.controller.ts:199` |
| Spec Compliance — No-show rate | ❌ | Endpoint stats **không có** `checkin_count` hay no-show rate | `catalog/controllers/workshops-admin.controller.ts:199` |
| Spec Compliance — Drill-down list | ✅ | `GET /admin/workshops/:id/registrations` với pagination | `booking/controllers/registrations.controller.ts:121` |
| Spec Compliance — Export CSV | ❌ | Không tìm thấy CSV export endpoint | `booking/controllers/registrations.controller.ts` |

**Gaps F9:**

- `❌ GAP-02` — **No-show rate**: `GET /admin/workshops/:id/stats` chưa include `checkin_count`. Cần JOIN `checkins` table để tính tỉ lệ.
- `❌ GAP-03` — **Export CSV**: Không có `GET /admin/workshops/:id/registrations/export` endpoint.

---

## Unit Test Failure Analysis

### AuthService (6 failures)

**`this.tokenService.isBlacklisted is not a function`** — 5 failures trong `refreshToken` tests

```
Location: src/modules/iam/services/auth.service.ts:165
Root cause: Mock của tokenService trong spec không include method `isBlacklisted`.
            TokenService có method này nhưng mock object không khai báo.
Fix: Thêm `isBlacklisted: jest.fn().mockResolvedValue(false)` vào mock.
```

**Login mock expectation mismatch** — 1 failure

```
Root cause: Expected args không match received — có thể TokenService.signAccessToken 
            signature thay đổi nhưng test chưa update.
```

### WorkshopsService (1 failure)

**`cancelWorkshop` notification log expectation**

```
Root cause: `notificationLogProducer.createAndEnqueue` expected args không khớp.
            Có thể payload format thay đổi.
```

### RegistrationsService (1 failure)

**`register paid workshop` — extra arg missing**

```
Expected mock: ("ws-001", "reg-001", "stu-001", 50000)  
Received:      ("ws-001", "reg-001", "stu-001")
Root cause: Service bỏ qua `price` arg khi gọi SeatLockMechanic hoặc method signature thay đổi.
Location: booking/services/registrations.service.ts
```

### RegistrationsRepository (2 failures)

**`findMyRegistrations` — query không trả `isSuccess: true`**

```
Root cause: Repository query hoặc mock setup không chính xác.
            Có thể schema field mapping thay đổi.
```

### NotificationsService (1 failure)

**`getLogById` — result mismatch**

```
Root cause: Service hoặc repository trả về data format không khớp với test expectation.
```

### RolesGuard (unconfirmed — suite failed)

---

## Summary

### ❌ Bugs (cần fix ngay)

| ID | Severity | Flow | Mô tả | File:Line |
|----|----------|------|-------|-----------|
| BUG-01 | CRITICAL | F3 | Payment service gọi `findById` trước idempotency/CB — sai thứ tự pipeline | `payment/services/payments.service.ts:118` |
| BUG-02 | HIGH | F3 | `payment.initiatedAt.toISOString()` crash khi `initiatedAt` null | `payment/dto/payment-response.dto.ts:51` |
| BUG-03 | HIGH | F3 | Integration test `PAYMENT_GATEWAY_OPEN` fail cascade từ BUG-01 | `test/integration/booking.integration.spec.ts:674` |
| BUG-04 | HIGH | F11 | `expo-crypto` package thiếu → mobile build hoàn toàn fail | `apps/mobile/package.json` |
| BUG-05 | HIGH | F11 | `allowedWorkshopIds` vs `allowed_workshop_ids` naming mismatch | `mobile/src/features/auth/hooks/use-auth.ts:63,74,75` + `profile.tsx:92` |
| BUG-06 | HIGH | F11 | `SafeAreaView` không import trong scan screen → crash khi render | `mobile/src/app/workshop/[id]/scan.tsx:91,130` |
| BUG-07 | MEDIUM | F11 | `ApiResponse.meta` required nhưng 204 response không có `meta` field | `mobile/src/lib/api/client/http.ts` |
| BUG-08 | MEDIUM | Unit | `tokenService.isBlacklisted` không có trong mock → 5 test fail | `iam/services/auth.service.spec.ts` |
| BUG-09 | MEDIUM | Unit | `register paid` — mock arg mismatch (thiếu `price`) | `booking/services/registrations.service.spec.ts` |
| BUG-10 | LOW | Unit | `cancelWorkshop` notification log expectation không khớp | `catalog/services/workshops.service.spec.ts` |
| BUG-11 | LOW | Unit | `findMyRegistrations` / `getLogById` repository test fail | `booking/repositories/`, `notification/services/` |

### ⚠️ Gaps vs Spec

| ID | Flow | Mô tả | Spec Reference |
|----|------|-------|----------------|
| GAP-01 | F6 | Không có refund trigger khi hủy workshop có phí | `user-flow.md` F6: "trigger hoàn tiền cho tất cả người đã đăng ký" |
| GAP-02 | F9 | No-show rate thiếu trong stats endpoint | `user-flow.md` F9: "check-in thực tế vs đăng ký (no-show rate)" |
| GAP-03 | F9 | Không có CSV export endpoint | `user-flow.md` F9: "Export CSV nếu cần" |

### Test Coverage Gaps (ưu tiên thêm)

| Module | Thiếu |
|--------|-------|
| `checkin/controllers/checkin.controller.ts` | Không có unit test spec |
| `background/workers/ai-summary.worker.ts` | Không có spec |
| `background/workers/student-sync.worker.ts` | Không có spec |
| `background/workers/notification.worker.ts` | Không có spec |
| `background/cron/` (tất cả 6 crons) | Không có spec |
| Web app (`apps/web`) | Zero test coverage |
| Mobile app (`apps/mobile`) | Zero test coverage |

---

## Recommendations

### Priority 1 — Fix ngay (blocking)

1. **BUG-04**: `pnpm add expo-crypto` trong `apps/mobile` — mobile build đang hoàn toàn fail
2. **BUG-01**: Move `registrationsRepo.findById` xuống sau CB check trong `PaymentsService.createPayment`
3. **BUG-05, BUG-06**: Fix naming + SafeAreaView import để mobile type check pass

### Priority 2 — Fix trước release

1. **BUG-02**: Add null guard `payment.initiatedAt?.toISOString() ?? new Date(0).toISOString()`
2. **BUG-07**: Adjust `ApiResponse` type hoặc `parseResponse` để handle 204 correctly
3. **BUG-08 → BUG-11**: Fix 15 failing unit tests (mock updates, signature alignment)

### Priority 3 — Spec compliance

1. **GAP-01**: Implement refund trigger (hoặc scope rõ là MVP out-of-scope)
2. **GAP-02**: Add `checkin_count` JOIN vào `GET /admin/workshops/:id/stats`
3. **GAP-03**: Add `GET /admin/workshops/:id/registrations/export` CSV endpoint

### Priority 4 — Test coverage

1. Thêm spec cho: `CheckinController`, `AiSummaryWorker`, `StudentSyncWorker`, background crons
2. Xem xét Playwright E2E cho web (hiện zero coverage)
