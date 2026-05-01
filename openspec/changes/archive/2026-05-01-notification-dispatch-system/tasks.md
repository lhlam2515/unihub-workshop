# Tasks: Notification Dispatch System (W3)

**Change:** `notification-dispatch-system`
**Dependency order:** Bottom-up (shared → repositories → channels → services → worker → DTOs → controller)

---

## Phase 1: Shared Layer — Error Codes

- [x] **Task 1.1:** Add notification error factories to `shared/response/errors.ts`
  - Add `notificationErrors` factory group with:
    - `logNotFound(notificationId)` → NOTIFICATION_LOG_NOT_FOUND (NOT_FOUND)
    - `channelConfigNotFound(channelType)` → NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND (NOT_FOUND)
    - `channelInactive(channelType)` → NOTIFICATION_CHANNEL_INACTIVE (BUSINESS)
    - `channelUnknown(channelType)` → NOTIFICATION_CHANNEL_UNKNOWN (VALIDATION)
  - **Files:** `apps/server/src/shared/response/errors.ts`, `apps/server/src/shared/response/types.ts`

---

## Phase 2: Data Access Layer — Repositories

- [x] **Task 2.1:** Implement `NotificationLogsRepository`
  - `findById(id)` — SELECT by notification_id, return row or null
  - `create(data: NewNotificationLog)` — INSERT returning the new row
  - `updateStatus(id, status, sentAt?, errorMessage?)` — UPDATE status, sent_at, error_message
  - `findMany(filters, pagination)` — SELECT with dynamic WHERE (status, channel, type, userId, workshopId) + ORDER BY created_at DESC + LIMIT/OFFSET + COUNT
  - Wrap all in `tryCatch` returning `Result<T>`
  - **Files:** `apps/server/src/modules/background/repositories/notification-logs.repository.ts`

- [x] **Task 2.2:** Implement `NotificationChannelConfigsRepository`
  - `findAll()` — SELECT all rows
  - `findByChannelType(type)` — SELECT WHERE channel_type = type, return row or null
  - `update(channelType, data)` — UPDATE is_active, config_json, updated_at WHERE channel_type = type, returning
  - Wrap all in `tryCatch` returning `Result<T>`
  - **Files:** `apps/server/src/modules/background/repositories/notification-channel-configs.repository.ts`

---

## Phase 3: Business Layer — Channel Adapters

- [x] **Task 3.1:** Create `INotificationChannel` interface
  - Define contract: `channelType` property + `send(recipient, payload, config)` method returning `Result<void>`
  - **Files:** `apps/server/src/modules/background/channels/notification-channel.interface.ts` (NEW)

- [x] **Task 3.2:** Implement `EmailChannel`
  - `channelType = "EMAIL"`
  - `send()` — log-first MVP: `this.logger.log('[EMAIL] To: ..., Subject: ...')`
  - Return `Result.ok()`
  - **Files:** `apps/server/src/modules/background/channels/email.channel.ts` (NEW)

- [x] **Task 3.3:** Implement `TelegramChannel`
  - `channelType = "TELEGRAM"`
  - `send()` — log-first MVP: `this.logger.log('[TELEGRAM] Chat: ..., Message: ...')`
  - Return `Result.ok()`
  - **Files:** `apps/server/src/modules/background/channels/telegram.channel.ts` (NEW)

- [x] **Task 3.4:** Implement `AppChannel`
  - `channelType = "APP"`
  - `send()` — log-first MVP: `this.logger.log('[APP] User: ..., Title: ..., Body: ...')`
  - Return `Result.ok()`
  - **Files:** `apps/server/src/modules/background/channels/app.channel.ts` (NEW)

---

## Phase 4: Business Layer — Services

- [x] **Task 4.1:** Implement `NotificationDispatchService`
  - Constructor-injected channel registry (`Record<string, INotificationChannel>`)
  - `dispatch(notificationId)` pipeline:
    1. Load notification log → not found → return `notificationErrors.logNotFound()`
    2. Load channel config → not found → return `notificationErrors.channelConfigNotFound()`
    3. Check `is_active` → false → update log FAILED + return `notificationErrors.channelInactive()`
    4. Resolve channel from registry → unknown → return `notificationErrors.channelUnknown()`
    5. Delegate to `channel.send(recipient, payload, config)`
    6. On success → update log SENT, return `Result.ok()`
    7. On failure → update log FAILED, return error
  - **Files:** `apps/server/src/modules/background/services/notification-dispatch.service.ts`

- [x] **Task 4.2:** Implement `NotificationsService`
  - `listLogs(filters, pagination)` — delegate to `notificationLogsRepo.findMany()`, map to response DTOs, return paginated
  - `getLogById(id)` — delegate to `notificationLogsRepo.findById()`, map to response DTO
  - `listChannelConfigs()` — delegate to `channelConfigsRepo.findAll()`, return raw configs (strip internal fields if any)
  - `updateChannelConfig(channelType, dto)` — validate channelType, delegate to `channelConfigsRepo.update()`
  - **Files:** `apps/server/src/modules/background/services/notifications.service.ts`

---

## Phase 5: Worker Layer

- [x] **Task 5.1:** Implement `NotificationWorker`
  - Add `@Processor(NOTIFICATION_QUEUE)` + extend `WorkerHost`
  - Queue `defaultJobOptions` configured in `queue.module.ts`: `{ attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } }`
  - `process(job)` handler: extract `notificationId` from `job.data`, call `dispatchService.dispatch()`
  - On dispatch failure → throw (triggers BullMQ retry)
  - On dispatch success → return (job complete)
  - Remove manual retry/backoff code (BullMQ handles it)
  - **Files:** `apps/server/src/modules/background/workers/notification.worker.ts`

---

## Phase 6: Presentation Layer — DTOs

- [x] **Task 6.1:** Add paginated list response DTO and query DTO
  - Create `ListNotificationLogsQueryDto` using `createZodDto` with Zod schema: `status`, `channel`, `type`, `userId`, `workshopId` (all optional), `page` (default 1), `limit` (default 20, max 100)
  - **Files:** `apps/server/src/modules/background/dto/notification-response.dto.ts`

- [x] **Task 6.2:** Wire `UpdateChannelConfigDto` as NestJS DTO
  - Ensure it extends `createZodDto(UpdateChannelConfigSchema)` so ZodValidationPipe applies
  - **Files:** `apps/server/src/modules/background/dto/update-channel-config.dto.ts`

---

## Phase 7: Presentation Layer — Controller

- [x] **Task 7.1:** Wire `NotificationsAdminController`
  - Replace `any` types with proper DTOs:
    - `listLogs(@Query() query: ListNotificationLogsQueryDto)`
    - `getLogById(@Param('id') id: string)`
    - `listChannelConfigs()`
    - `updateChannelConfig(@Param('channelType') channelType: string, @Body() dto: UpdateChannelConfigDto)`
  - Return `Result` directly (ResponseInterceptor handles mapping)
  - Ensure `@Roles('ORGANIZER')` and `@UseGuards(JwtAuthGuard, RolesGuard)` remain
  - **Files:** `apps/server/src/modules/background/controllers/notifications-admin.controller.ts`

---

## Phase 8: Module Registration

- [x] **Task 8.1:** Register new channel providers in `BackgroundModule`
  - Add `EmailChannel`, `TelegramChannel`, `AppChannel` to `providers` array
  - Verify `NotificationWorker` is already in providers
  - **Files:** `apps/server/src/modules/background/background.module.ts`

---

## Verification

- [x] `pnpm check-types --filter=server` passes
- [x] `pnpm lint --filter=server` passes (no notification-specific errors)
- [x] `pnpm build --filter=server` succeeds (DI resolution)
- [x] No circular dependency warnings on startup (verified: build passes with no DI resolution errors)
