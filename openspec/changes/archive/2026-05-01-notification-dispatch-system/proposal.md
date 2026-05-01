# Proposal: Notification Dispatch System (W3)

**Change:** `notification-dispatch-system`
**Source:** `docs/guides/parallel-implementation-plan.md` §5, `docs/srs.md` §F08
**Scope:** Module `background` — notification worker, dispatch orchestration, channel adapters, admin API

## Summary

Implement the asynchronous notification dispatch pipeline that delivers workshop events (registration confirmed, payment success, workshop cancelled, etc.) to students via configured channels (Email, Telegram, App push). All dispatch flows through BullMQ to ensure the main request path is never blocked by external service latency.

## Motivation

- **F08 is a MUST-priority module** per SRS traceability matrix
- Notifications are the primary mechanism for keeping students informed about their registrations, payments, and workshop changes
- The queue infrastructure (W1) is already in place — this is the first consumer
- The admin API for monitoring notification logs and managing channel configs is needed by organizers

## What Changes

### Files Modified (11 files — all stubs exist)

| # | Layer | File | Change |
|---|-------|------|--------|
| 1 | Channel | `background/channels/notification-channel.interface.ts` (NEW) | Define `INotificationChannel` contract |
| 2 | Channel | `background/channels/email.channel.ts` (NEW) | Log-first EMAIL adapter |
| 3 | Channel | `background/channels/telegram.channel.ts` (NEW) | Log-first TELEGRAM adapter |
| 4 | Channel | `background/channels/app.channel.ts` (NEW) | Log-first APP push adapter |
| 5 | Repository | `background/repositories/notification-logs.repository.ts` | Implement `findById`, `create`, `updateStatus`, `findMany` |
| 6 | Repository | `background/repositories/notification-channel-configs.repository.ts` | Implement `findAll`, `findByChannelType`, `update` |
| 7 | Service | `background/services/notifications.service.ts` | Implement admin query + config management methods |
| 8 | Service | `background/services/notification-dispatch.service.ts` | Implement dispatch orchestrator with channel registry |
| 9 | Worker | `background/workers/notification.worker.ts` | Wire `@Processor` with exponential backoff |
| 10 | Controller | `background/controllers/notifications-admin.controller.ts` | Wire 4 endpoints, typed DTOs |
| 11 | DTO | `background/dto/notification-response.dto.ts` | Add paginated list response type |

### Files NOT Touched

- `background/background.module.ts` — already imports `SharedQueueModule` and registers all providers
- `shared/queues/` — W1 infrastructure unchanged
- `database/schema/` — schemas already defined
- `database/types/` — types already inferred

### Architecture Decision: Strategy Pattern for Channels

Each notification channel (EMAIL, TELEGRAM, APP) is implemented as a separate `@Injectable()` class implementing `INotificationChannel`. The dispatch service holds an internal registry keyed by channel type. Adding a new channel requires one new file + one line in the registry — no existing channel code is modified.

## Impact

- **No breaking changes** — all new functionality, no existing API surface modified
- **No database migrations** — schemas are pre-existing
- **No new dependencies** — BullMQ (`@nestjs/bullmq`) already installed; no SMTP/Telegram SDKs needed for MVP
- **Log-first MVP** — channel adapters log to console instead of calling real external services; real integrations are follow-up work per the plan's out-of-scope section

## Risks

| Risk | Mitigation |
|------|-----------|
| Retry spam on persistent failures | BullMQ exponential backoff with max 5 attempts; FAILED status prevents re-dispatch |
| Channel config missing/inactive | Dispatch service checks `is_active` before sending; returns clear error |
| Notification logs table growth | `removeOnFail` cleanup after 24h; PENDING partial index for efficient worker queries |
