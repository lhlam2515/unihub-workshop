# API Compliance Report — UniHub Workshop Server

> **Phạm vi**: Đối chiếu 18 controller files (`apps/server/src/modules/**/*.controller.ts`) với `docs/api/openapi.yaml`
> **Ngày kiểm tra**: 2026-05-13
> **Công cụ**: Static code analysis (không chạy runtime)

---

## Executive Summary

| Danh mục | Số lượng |
|---|---|
| Endpoint khớp hoàn toàn | ~38 / 51 |
| **Mismatch** (endpoint tồn tại cả hai phía nhưng không khớp) | **9** |
| **Extra** (implement nhưng không có trong spec) | **4** |
| **Missing** (trong spec nhưng chưa implement) | **1** |

### Severity Overview

| Severity | # | Vấn đề |
|---|---|---|
| CRITICAL | 2 | URL mount sai, Payment flow khác hoàn toàn |
| HIGH | 2 | Checkin sync enum sai, Reconcile duplicate route |
| MEDIUM | 7 | HTTP status, request field, extra endpoints, envelope shape |
| LOW | 2 | Missing admin speaker detail, extra notification log detail |

---

## I. MISMATCH — Endpoint tồn tại nhưng không khớp spec

---

### M-01 ⛔ CRITICAL — URL route sai: `GET /admin/workshops/{workshopId}/registrations`

**operationId**: `adminListRegistrations` | **Tag**: Booking

**Spec**: `GET /admin/workshops/{workshopId}/registrations`

**Thực tế**:

```
Controller: @Controller("registrations")         ← prefix = "registrations"
Method:     @Get("/admin/workshops/:workshopId/registrations")
Actual URL: /registrations/admin/workshops/:workshopId/registrations  ← SAI
```

NestJS luôn nối controller prefix với method path; dấu `/` đầu trong method path **không** tạo absolute route.

**File**: `apps/server/src/modules/booking/controllers/registrations.controller.ts:135`

**Đề xuất sửa**: Tách endpoint admin ra controller riêng hoặc đổi `@Controller` prefix:

```typescript
// Option A: Tạo WorkshopsAdminBookingController riêng
@Controller("admin/workshops")
export class WorkshopsAdminBookingController {
  @Get(":workshopId/registrations")
  @Roles("BTC")
  adminListRegistrations(...) {}
}

// Option B: Đổi prefix controller thành empty
@Controller()
// ...
@Get("admin/workshops/:workshopId/registrations")
```

---

### M-02 ⛔ CRITICAL — `POST /payments`: response body và status khác hoàn toàn

**operationId**: `createPayment` | **Tag**: Payment

**Spec** (synchronous gateway flow):

- HTTP 200 on success → `Payment` schema: `{ id, registrationId, amount, currency, status: "SUCCEEDED", gateway, initiatedAt, resolvedAt }`
- HTTP 402 → declined, HTTP 503 → CB OPEN, HTTP 504 → TIMEOUT

**Thực tế** (redirect flow):

- HTTP 201 Created → `CreatePaymentResponseDto`: `{ paymentId, redirectUrl, paymentDeadline }`
- Client redirect đến gateway → webhook callback → poll `GET /payments/{id}`

**File**: `apps/server/src/modules/payment/controllers/payments.controller.ts:68-80`

**Lưu ý kiến trúc**: Đây là sự khác biệt về design pattern, không phải lỗi đơn thuần:

- Spec mô hình: Server call gateway synchronously (5s timeout), trả kết quả ngay
- Implementation: Gateway redirect model (phổ biến với VNPay/MoMo local)

**Đề xuất**: Cập nhật spec `docs/api/openapi.yaml` để phản ánh redirect flow thực tế, hoặc thảo luận với team về việc align một trong hai.

---

### M-03 🔴 HIGH — `POST /checkins/sync`: enum `result` sai

**operationId**: `syncCheckins` | **Tag**: Check-in

**Spec** — `CheckinSyncResultItem.result`:

```
"SYNCED" | "CONFLICT" | "FAILED"
```

**Thực tế** — `SyncResultKind`:

```typescript
// apps/server/src/modules/checkin/dto/checkin-sync-response.dto.ts:1
export type SyncResultKind = "OK" | "DUPLICATE" | "REJECTED";
```

**Mapping**:

| Spec | Implementation |
|---|---|
| `SYNCED` | `OK` |
| `CONFLICT` | `DUPLICATE` |
| `FAILED` | `REJECTED` |

**File**: `apps/server/src/modules/checkin/dto/checkin-sync-response.dto.ts:1`

**Đề xuất sửa**: Đổi enum values trong DTO để match spec:

```typescript
export type SyncResultKind = "SYNCED" | "CONFLICT" | "FAILED";
```

Cần update toàn bộ references và test.

---

### M-04 🔴 HIGH — `POST /admin/payments/reconcile`: hai controller xung đột

**operationId**: `triggerReconciliation` | **Tag**: System Admin

**Spec**: `POST /admin/payments/reconcile` → **202 Accepted**

**Thực tế** — có hai controller cùng xử lý endpoint này:

| Controller | Effective URL | HTTP Status |
|---|---|---|
| `PaymentsAdminController` (`@Controller()` + `@Post("admin/payments/reconcile")`) | `/admin/payments/reconcile` ✓ | **200 OK** ✗ |
| `SystemAdminController` (`@Controller("/admin/system")` + `@Post("payments/reconcile")`) | `/admin/system/payments/reconcile` ✗ | **202 Accepted** ✓ |

URL đúng nhưng status sai ở `PaymentsAdminController`; URL sai nhưng status đúng ở `SystemAdminController`.

**Files**:

- `apps/server/src/modules/payment/controllers/payments-admin.controller.ts:44-48`
- `apps/server/src/modules/background/controllers/system-admin.controller.ts:118-119`

**Đề xuất sửa**:

1. Xóa `@Post("payments/reconcile")` khỏi `SystemAdminController`
2. Sửa `PaymentsAdminController` → `@HttpCode(HttpStatus.ACCEPTED)`

---

### M-05 🟡 MEDIUM — `POST /payments`: HTTP status 201 thay vì 200

**Lưu ý**: Đã bao gồm trong M-02 nhưng tách riêng để tracking dễ hơn.

**File**: `apps/server/src/modules/payment/controllers/payments.controller.ts:73`

```typescript
@HttpCode(HttpStatus.CREATED)  // ← phải là HttpStatus.OK (200) theo spec
```

---

### M-06 🟡 MEDIUM — `POST /admin/imports/trigger`: field name không khớp

**operationId**: `triggerImport` | **Tag**: CSV Import

**Spec** — request body:

```yaml
properties:
  filePath:
    type: string
    example: /input/students_2026-05-12-supplement.csv
```

**Thực tế** — `TriggerStudentSyncDto`:

```typescript
// apps/server/src/modules/csv-sync/dto/trigger-student-sync.dto.ts:12
sourceFileName: z.string().min(1).max(500),
```

`filePath` → `sourceFileName`. Ngoài tên field, spec dùng đường dẫn tuyệt đối container (`/input/`), DTO dùng tên file đơn thuần.

**Đề xuất**: Align field name với spec (`filePath`) và cập nhật validation/documentation.

---

### M-07 🟡 MEDIUM (Global) — Response envelope có extra fields

**Ảnh hưởng**: TẤT CẢ endpoints

**Spec** — response shape:

```json
{ "data": { ... }, "pagination": { ... } }
```

**Thực tế** — `ResponseInterceptor` wrap thêm:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "...", "timestamp": "...", "apiVersion": "v1", "processingMs": 42 },
  "pagination": { ... }
}
```

**File**: `apps/server/src/core/interceptors/response.interceptor.ts`

**Đánh giá**: `success` và `meta` là enhancement hữu ích cho client debugging. Nếu web/mobile client đã implement theo envelope này thì không nên sửa — nên cập nhật spec.

---

### M-08 🟡 MEDIUM (Global) — Error envelope field names khác

**Ảnh hưởng**: TẤT CẢ error responses

**Spec** — `ErrorEnvelope` (RFC 7807-inspired):

```json
{
  "error": {
    "type": "urn:error:registration.workshop_full",
    "title": "Workshop Full",
    "status": 422,
    "detail": "No seats available"
  }
}
```

**Thực tế**:

```json
{
  "success": false,
  "error": {
    "code": "WORKSHOP_FULL",
    "message": "No seats available",
    "fieldErrors": [...]
  },
  "meta": { ... }
}
```

Mapping: `type` (URN string) → `code` (enum string), `title`/`detail` → `message`.

**Đề xuất**: Cập nhật spec để reflect `code` + `message` pattern thực tế, hoặc thêm `type` field vào `AppError` để backward-compat với spec.

---

### M-09 🟡 MEDIUM — `POST /payments`: thiếu `paymentKey` trong request body

**operationId**: `createPayment`

**Spec** — mô tả:
> "The `paymentKey` is included **in the request body**... client must generate it once and **reuse the same key on every retry**."

**Spec** có cả `X-Idempotency-Key` header VÀ `paymentKey` trong body (để forward tới gateway).

**Thực tế** — `CreatePaymentDto`:

```typescript
{ registrationId: string, gateway: "VNPAY" | "MOMO" | "STRIPE" }
// Không có paymentKey field
```

Chỉ dùng `X-Idempotency-Key` header. Nếu implementation dùng header value làm gateway key thì cần document rõ trong spec.

---

## II. EXTRA — Endpoint implement nhưng không có trong spec

---

### E-01 🟡 MEDIUM — `GET /students/me/payments`

**Controller**: `PaymentsController`
**File**: `apps/server/src/modules/payment/controllers/payments.controller.ts:117-123`

Spec không định nghĩa endpoint này. Client web/mobile có thể đang dùng để hiển thị lịch sử thanh toán.

**Đề xuất**: Thêm vào spec hoặc xác nhận xem có cần thiết không.

---

### E-02 🟡 MEDIUM — `DELETE /admin/rooms/:id`

**Controller**: `RoomsAdminController`
**File**: `apps/server/src/modules/catalog/controllers/rooms-admin.controller.ts`

Spec chỉ định nghĩa `GET` và `PATCH` cho `/admin/rooms/{roomId}`. Không có `DELETE`.

**Đề xuất**: Thêm DELETE vào spec (với cascading rules) hoặc bỏ endpoint nếu không cần.

---

### E-03 ⚪ LOW — `GET /admin/notifications/logs/:id`

**Controller**: `NotificationsAdminController`
**File**: `apps/server/src/modules/notification/controllers/notifications-admin.controller.ts`

Spec chỉ có `GET /admin/notifications/logs` (list). Không có detail endpoint.

---

### E-04 🟡 MEDIUM — `POST /admin/system/payments/reconcile`

**Controller**: `SystemAdminController`
**File**: `apps/server/src/modules/background/controllers/system-admin.controller.ts:118`

URL là `/admin/system/payments/reconcile` — không có trong spec. Spec có `/admin/payments/reconcile`. Đây là duplicate route của M-04. Nên xóa bỏ.

---

## III. MISSING — Endpoint trong spec chưa implement

---

### X-01 ⚪ LOW — `GET /admin/speakers/{speakerId}`

**operationId**: `adminGetSpeaker` | **Tag**: Catalog Admin

Spec định nghĩa full CRUD cho `/admin/speakers/{speakerId}`:

```
GET    /admin/speakers/{speakerId}  ← MISSING
PATCH  /admin/speakers/{speakerId}  ✓
DELETE /admin/speakers/{speakerId}  ✓
```

`speakers-admin.controller.ts` có PATCH và DELETE nhưng thiếu GET detail.

**File cần thêm vào**: `apps/server/src/modules/catalog/controllers/speakers-admin.controller.ts`

**Đề xuất sửa**:

```typescript
@Get(":id")
async getSpeaker(@Param("id") id: string) {
  return this.speakersService.getSpeakerById(id);
}
```

---

## IV. Appendix — Enum Compliance

| Enum | Spec | DB (enums.schema.ts) | Status |
|---|---|---|---|
| Workshop status | DRAFT/OPEN/COMPLETED/CANCELLED | DRAFT/OPEN/COMPLETED/CANCELLED | ✅ |
| Registration status | PENDING/CONFIRMED/PAID/CANCELLED | PENDING/CONFIRMED/PAID/CANCELLED | ✅ |
| Payment status | INITIATED/SUCCEEDED/FAILED/UNRESOLVED | INITIATED/SUCCEEDED/FAILED/UNRESOLVED | ✅ |
| AI Summary status | NONE/QUEUED/PROCESSING/DONE/FAILED | NONE/QUEUED/PROCESSING/DONE/FAILED | ✅ |
| CheckinSync result | SYNCED/CONFLICT/FAILED | OK/DUPLICATE/REJECTED | ❌ (M-03) |
| Notification channel | EMAIL/APP/TELEGRAM | APP/EMAIL/TELEGRAM | ✅ |

---

## V. Appendix — Endpoint Coverage Matrix

### Endpoints khớp hoàn toàn ✅

| Method | Path | operationId |
|---|---|---|
| POST | /auth/login | login |
| POST | /auth/refresh | refresh |
| POST | /auth/logout | logout |
| GET | /auth/me | getMe |
| POST | /device-tokens | registerDeviceToken |
| DELETE | /device-tokens/{token} | deactivateDeviceToken |
| GET | /workshops | listWorkshops |
| GET | /workshops/{workshopId} | getWorkshop |
| GET | /workshops/{workshopId}/availability | getWorkshopAvailability |
| GET | /rooms/{roomId} | getRoom |
| GET | /speakers/{speakerId} | getSpeaker |
| GET | /admin/workshops | adminListWorkshops |
| POST | /admin/workshops | adminCreateWorkshop |
| GET | /admin/workshops/{workshopId} | adminGetWorkshop |
| PATCH | /admin/workshops/{workshopId} | adminPatchWorkshop |
| POST | /admin/workshops/{workshopId}/publish | adminPublishWorkshop |
| PATCH | /admin/workshops/{workshopId}/emergency-update | adminEmergencyUpdateWorkshop |
| POST | /admin/workshops/{workshopId}/cancel | adminCancelWorkshop |
| GET | /admin/workshops/{workshopId}/stats | adminGetWorkshopStats |
| GET | /admin/speakers | adminListSpeakers |
| POST | /admin/speakers | adminCreateSpeaker |
| PATCH | /admin/speakers/{speakerId} | adminPatchSpeaker |
| DELETE | /admin/speakers/{speakerId} | adminDeleteSpeaker |
| GET | /admin/rooms | adminListRooms |
| POST | /admin/rooms | adminCreateRoom |
| GET | /admin/rooms/{roomId} | adminGetRoom |
| PATCH | /admin/rooms/{roomId} | adminPatchRoom |
| POST | /registrations | createRegistration |
| GET | /registrations | listMyRegistrations |
| GET | /registrations/{registrationId} | getRegistration |
| DELETE | /registrations/{registrationId} | cancelRegistration |
| GET | /payments/{paymentId} | getPayment |
| POST | /payments/webhook/{gateway} | paymentWebhook |
| GET | /checkin/workshops/{workshopId}/registrations | checkinPreloadRegistrations |
| GET | /checkin/workshops/{workshopId}/status | — |
| POST | /checkins | createCheckin |
| POST | /checkins/sync | syncCheckins (URL ✓, enum ✗ → M-03) |
| POST | /admin/workshops/{workshopId}/summary | uploadSummaryPdf |
| GET | /admin/workshops/{workshopId}/summary | getSummary |
| PUT | /admin/workshops/{workshopId}/summary | putSummary |
| POST | /admin/workshops/{workshopId}/summary/retry | retrySummary |
| GET | /admin/imports | listImports |
| GET | /admin/imports/{importId} | getImport |
| GET | /admin/imports/{importId}/errors | getImportErrors |
| GET | /admin/system/circuit-breaker | getCircuitBreakerState |
| POST | /admin/system/circuit-breaker/{gateway}/reset | resetCircuitBreaker |
| GET | /admin/system/jobs/payment-timeout | — |
| GET | /admin/system/jobs/reconciliation | — |
| GET | /admin/notification-channels | listNotificationChannels |
| PATCH | /admin/notification-channels/{channelId} | patchNotificationChannel |
| GET | /admin/notifications/logs | listNotificationLogs |
| GET | /admin/users | adminListUsers |
| GET | /admin/users/{id} | adminGetUser |
| PATCH | /admin/users/{id}/status | adminUpdateUserStatus |
| POST | /admin/users/{id}/revoke-token | adminRevokeUserTokens |
| POST | /admin/checkin-staff/{userId}/assign-workshops | adminAssignCheckinWorkshops |
| GET | /admin/checkin-staff/{userId}/workshops | adminGetCheckinWorkshops |
