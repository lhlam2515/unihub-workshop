# Verify API Spec vs Code — Checklist

## Step 1: Route Coverage (42 spec paths vs controllers)

### Auth (4)
- [ ] `POST /auth/login` → `AuthController.login()`
- [ ] `POST /auth/refresh` → `AuthController.refresh()`
- [ ] `POST /auth/logout` → `AuthController.logout()`
- [ ] `GET /auth/me` → `AuthController.me()`

### Device Tokens (2)
- [ ] `POST /device-tokens` → `DeviceTokensController.register()`
- [ ] `DELETE /device-tokens/{token}` → `DeviceTokensController.unregister()`

### Catalog Public (5)
- [ ] `GET /workshops` → `WorkshopsPublicController.listPublished()`
- [ ] `GET /workshops/{workshopId}` → `WorkshopsPublicController.getPublishedById()`
- [ ] `GET /workshops/{workshopId}/availability` → `WorkshopsPublicController.getAvailability()`
- [ ] `GET /rooms/{roomId}` → `RoomsPublicController.getById()`
- [ ] `GET /speakers/{speakerId}` → `SpeakersPublicController.getById()`

### Catalog Admin (12)
- [ ] `GET /admin/workshops` → `WorkshopsAdminController.listWorkshops()`
- [ ] `POST /admin/workshops` → `WorkshopsAdminController.createWorkshop()`
- [ ] `GET /admin/workshops/{workshopId}` → `WorkshopsAdminController.getWorkshop()`
- [ ] `PATCH /admin/workshops/{workshopId}` → `WorkshopsAdminController.updateWorkshop()`
- [ ] `POST /admin/workshops/{workshopId}/publish` → `WorkshopsAdminController.publishWorkshop()`
- [ ] `PATCH /admin/workshops/{workshopId}/emergency-update` → `WorkshopsAdminController.emergencyUpdate()`
- [ ] `POST /admin/workshops/{workshopId}/cancel` → `WorkshopsAdminController.cancelWorkshop()`
- [ ] `GET /admin/workshops/{workshopId}/stats` → `WorkshopsAdminController.getWorkshopStats()`
- [ ] `GET /admin/speakers` → `SpeakersAdminController.listSpeakers()`
- [ ] `POST /admin/speakers` → `SpeakersAdminController.createSpeaker()`
- [ ] `GET /admin/rooms` → `RoomsAdminController.listRooms()`
- [ ] `POST /admin/rooms` → `RoomsAdminController.createRoom()`

### Booking (4)
- [ ] `POST /registrations` → `RegistrationsController.createRegistration()`
- [ ] `GET /registrations` → `RegistrationsController.getMyRegistrations()`
- [ ] `GET /registrations/{registrationId}` → `RegistrationsController.getRegistration()`
- [ ] `GET /admin/workshops/{workshopId}/registrations` → `RegistrationsController.getAdminRegistrations()`

### Payment (3 + 1 reconcile)
- [ ] `POST /payments` → `PaymentsController.createPayment()`
- [ ] `GET /payments/{paymentId}` → `PaymentsController.getMyPayment()`
- [ ] `POST /payments/webhook/{gateway}` → `PaymentsController.handleWebhook()`
- [x] `POST /admin/payments/reconcile` → `PaymentsAdminController.reconcile()` **(just added)**

### Check-in (4)
- [ ] `GET /checkin/workshops/{workshopId}/registrations` → `CheckinPreloadController.getWorkshopRegistrations()`
- [ ] `POST /checkins` → `CheckinController.checkin()`
- [ ] `POST /checkins/sync` → `CheckinController.sync()`

### AI Summary (3)
- [ ] `GET /admin/workshops/{workshopId}/summary` → `AiSummaryAdminController.getSummary()`
- [ ] `POST /admin/workshops/{workshopId}/summary` → `AiSummaryAdminController.requestSummary()`
- [ ] `POST /admin/workshops/{workshopId}/summary/retry` → `AiSummaryAdminController.retrySummary()`

### CSV Import /admin/imports (4)
- [x] `GET /admin/imports` → `StudentSyncAdminController.listJobs()` **(path fixed)**
- [x] `GET /admin/imports/{importId}` → `StudentSyncAdminController.getJobStatus()` **(path fixed)**
- [ ] `GET /admin/imports/{importId}/errors` → `StudentSyncAdminController.getJobErrors()` — ⚠ spec says `text/csv`, code returns JSON
- [x] `POST /admin/imports/trigger` → `StudentSyncAdminController.triggerSync()` **(path fixed)**

### System Admin (2)
- [ ] `GET /admin/system/circuit-breaker` → `SystemAdminController.getCircuitBreakerStatus()`
- [ ] `POST /admin/system/circuit-breaker/{gateway}/reset` → `SystemAdminController.resetCircuitBreaker()`

### Notification Admin (3)
- [ ] `GET /admin/notification-channels` → `NotificationChannelsController.listChannelConfigs()`
- [ ] `PATCH /admin/notification-channels/{channelId}` → `NotificationChannelsController.updateChannelConfig()`
- [ ] `GET /admin/notifications/logs` → `NotificationsAdminController.listLogs()`

---

## Step 2: Code Endpoints NOT in Spec (cần quyết định: add to spec hoặc giữ nguyên)

### Đã thêm vào spec (2026-05-09):
- [x] `GET /admin/system/jobs/payment-timeout` — ✅ Added
- [x] `GET /admin/system/jobs/reconciliation` — ✅ Added
- [x] `GET /checkin/workshops/{workshopId}/status` — ✅ Added
- [x] `GET /admin/speakers/{speakerId}` — ✅ Already in spec
- [x] `PATCH /admin/speakers/{speakerId}` — ✅ Already in spec
- [x] `DELETE /admin/speakers/{speakerId}` — ✅ Already in spec
- [x] `PATCH /admin/rooms/{roomId}` — ✅ Already in spec
- [x] `DELETE /registrations/{id}` — ✅ Already in spec
- [x] `GET /admin/users` — ✅ Added
- [x] `GET /admin/users/{id}` — ✅ Added
- [x] `PATCH /admin/users/{id}/status` — ✅ Added
- [x] `POST /admin/users/{id}/revoke-token` — ✅ Added
- [x] `POST /admin/checkin-staff/{userId}/assign-workshops` — ✅ Added
- [x] `GET /admin/checkin-staff/{userId}/workshops` — ✅ Added

### Code-only (no code implementation — ghi nhận):
- ⚠️ `GET /admin/speakers/{speakerId}` — in spec but **NOT** implemented in `SpeakersAdminController` (only `listSpeakers()` exists)

---

## Step 3: Response Schema Verification

### ErrorEnvelope shape
- [x] Spec updated: `{ success: false, error: { code, message, fieldErrors? }, meta }`
- [ ] Frontend `ApiResponse` type matches (src/lib/api/types.ts)
- [ ] Backend `ApiResponse` type matches (src/shared/response/types.ts)

### Pagination shape
- [ ] Spec uses cursor-based: `{ data: [...], pagination: { limit, nextCursor, hasMore, total? } }`
- [ ] Code `PaginatedData<T>` uses `data[]` not `items`
- [ ] Frontend `api.getPaginated()` unwraps `success.data.data` correctly

### DTO field names (camelCase everywhere)
- [ ] Registration: `workshopId`, `registeredAt`, `qrCode`, not snake_case
- [ ] Payment: `paymentId`, `amount`, `currency`, not snake_case
- [ ] Workshop: all fields camelCase per spec
- [ ] Check all `from()` factories in DTOs for snake_case → camelCase mapping

---

## Step 4: Known Remaining Mismatches (not blocking — ghi nhận)

| Issue | Spec | Code | Priority |
|-------|------|------|----------|
| Import errors format | `text/csv` | JSON `{ items, total }` | Low |
| RegistrationDto extra fields | N/A | Has `studentId`, `confirmedAt`, `cancelledAt` | Low |
| RegistrationListItem missing `workshop` | Required | Not populated | Medium |
| `/students/me/payments` not in spec | Missing | Code has it | Medium |
| Service layer returns `Result<any>` | N/A | Should use typed Result<T> | Medium |

---

## Step 5: How to Run the Verification

```bash
# 1. Check routes registered in NestJS:
cd apps/server && npx nest info
# OR grep all @Controller + method decorators:
find src/modules -name '*.controller.ts' | xargs grep -l '@Controller'

# 2. Validate OpenAPI spec:
python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml')); print('✓ Valid YAML')"

# 3. Type-check server:
pnpm --filter server check-types

# 4. List all distinct NestJS routes (manual):
#    grep for @Controller, then for each @Get/@Post/etc within

# 5. Compare response interceptors:
cd apps/server && cat src/core/interceptors/response.interceptor.ts

# 6. Check frontend API client paths:
cd apps/web && grep -rn 'API_ROUTES' src/constants/api-routes.ts
```

---

## Executed in This Session

| Task | Status |
|------|--------|
| Update ErrorEnvelope schema | ✅ Done |
| Add SuccessEnvelope, RequestMeta, FieldError schemas | ✅ Done |
| Update TooManyRequests example | ✅ Done |
| Fix student-sync → /admin/imports path | ✅ Done |
| Add POST /admin/imports/trigger route | ✅ Done |
| Add POST /admin/payments/reconcile endpoint | ✅ Done |
| Add GET /admin/system/jobs/* endpoints | ✅ Done |
| Add GET /checkin/workshops/{workshopId}/status | ✅ Done |
| Add GET /admin/users, GET /admin/users/{id} | ✅ Done |
| Add PATCH /admin/users/{id}/status | ✅ Done |
| Add POST /admin/users/{id}/revoke-token | ✅ Done |
| Add POST /admin/checkin-staff/{userId}/assign-workshops | ✅ Done |
| Add GET /admin/checkin-staff/{userId}/workshops | ✅ Done |
| Add PaymentTimeoutJobStatus, ReconciliationJobStatus schemas | ✅ Done |
| Add CheckinStatus, UserResponse, UpdateUserStatusRequest, AssignWorkshopsRequest schemas | ✅ Done |
