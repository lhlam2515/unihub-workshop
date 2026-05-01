# Design: Notification Dispatch System (W3)

**Change:** `notification-dispatch-system`
**Derived from:** `proposal.md`, SRS §F08, parallel-implementation-plan §5

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     NOTIFICATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Business Event (any module)                                     │
│       │                                                          │
│       ▼                                                          │
│  notificationQueue.add(job) ─── fire-and-forget                  │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────────┐                       │
│  │     NotificationWorker               │                       │
│  │     @Processor(NOTIFICATION_QUEUE)    │                       │
│  │     attempts: 5, backoff: exponential │                       │
│  └──────────────┬───────────────────────┘                       │
│                 │                                                │
│                 ▼                                                │
│  ┌──────────────────────────────────────┐                       │
│  │  NotificationDispatchService         │                       │
│  │                                      │                       │
│  │  dispatch(notificationId)            │                       │
│  │    1. Load notification log          │                       │
│  │    2. Load channel config            │                       │
│  │    3. Check is_active                │                       │
│  │    4. Resolve channel strategy       │                       │
│  │    5. Delegate to channel.send()     │                       │
│  │    6. Update log: SENT | FAILED      │                       │
│  └──────────────┬───────────────────────┘                       │
│                 │                                                │
│     ┌───────────┼───────────┐                                   │
│     ▼           ▼           ▼                                   │
│  Email      Telegram      App                                   │
│  Channel    Channel       Channel                               │
│  (log)      (log)         (log)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Channel Interface (`INotificationChannel`)

The Strategy contract. Each channel is an independent `@Injectable()` class.

```typescript
export interface INotificationChannel {
  readonly channelType: "EMAIL" | "TELEGRAM" | "APP";
  send(
    recipient: string,
    payload: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Result<void>>;
}
```

**Rationale:**
- `channelType` is a discriminant — the dispatch service uses it as a registry key
- `send()` accepts raw config from `channel_configs.config_json` — each channel parses what it needs
- Return type is `Result<void>` — channels never throw; failures are returned as values

### 2. Channel Implementations (Log-First MVP)

All three channels follow the same pattern: log the intent, return `Result.ok()`. Real integrations replace the log line.

```
EmailChannel:
  - channelType = "EMAIL"
  - send(): logger.log(`[EMAIL] To: ${recipient}, Subject: ${payload.subject}`)

TelegramChannel:
  - channelType = "TELEGRAM"
  - send(): logger.log(`[TELEGRAM] Chat: ${recipient}, Message: ${payload.message}`)

AppChannel:
  - channelType = "APP"
  - send(): logger.log(`[APP] User: ${recipient}, Title: ${payload.title}`)
```

### 3. Dispatch Service

Orchestrates the dispatch flow. Owns the channel registry.

```typescript
@Injectable()
export class NotificationDispatchService {
  private readonly channels: Record<string, INotificationChannel>;

  constructor(
    private readonly logsRepo: NotificationLogsRepository,
    private readonly configsRepo: NotificationChannelConfigsRepository,
    emailChannel: EmailChannel,
    telegramChannel: TelegramChannel,
    appChannel: AppChannel,
  ) {
    // Registry — add new channels here
    this.channels = {
      EMAIL: emailChannel,
      TELEGRAM: telegramChannel,
      APP: appChannel,
    };
  }
}
```

**Dispatch flow:**
1. Load `notificationLogs.findById(notificationId)` → return error if not found
2. Load `channelConfigs.findByChannelType(log.channel)` → return error if config missing
3. Guard: if `!config.isActive` → update log FAILED, return error
4. Resolve: `const channel = this.channels[log.channel]`
5. Delegate: `await channel.send(recipient, log.payload, config.configJson)`
6. If success → `logsRepo.updateStatus(id, "SENT", new Date())`
7. If failure → `logsRepo.updateStatus(id, "FAILED", undefined, error.message)`

### 4. Worker (Retry Strategy)

```typescript
@Processor(NOTIFICATION_QUEUE, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000,  // 5s → 10s → 20s → 40s → 80s (capped at ~300s by BullMQ)
  },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
})
```

**Job handler:**
- Receives `Job<NotificationJobData>` from BullMQ
- Calls `dispatchService.dispatch(job.data.notificationId)`
- If dispatch fails → throw (triggers BullMQ retry)
- If dispatch succeeds → return (job complete)
- After max attempts → job moved to failed queue, log already at FAILED status

### 5. Admin Service (`NotificationsService`)

Read-only queries + config management. No dispatch logic here.

```
listLogs(filters, pagination) → PaginatedData<NotificationLogResponseDto>
  - Filters: status, channel, type, userId, workshopId, dateRange
  - Pagination: page, limit
  - Uses idx_notif_status for PENDING queries

getLogById(id) → NotificationLogResponseDto
  - Returns full log with payload

listChannelConfigs() → NotificationChannelConfigResponseDto[]
  - Returns all channel configs (is_active, config_json, updated_at)

updateChannelConfig(channelType, dto) → NotificationChannelConfigResponseDto
  - Validates channelType against known enum
  - Updates is_active and config_json
```

### 6. Repositories

**NotificationLogsRepository:**
| Method | Drizzle Operation | Notes |
|--------|------------------|-------|
| `findById(id)` | `SELECT WHERE notification_id = $1` | Single row or null |
| `create(data)` | `INSERT INTO notification_logs` | Returns inserted row |
| `updateStatus(id, status, sentAt?, errorMsg?)` | `UPDATE SET status, sent_at, error_message WHERE notification_id = $1` | Partial update |
| `findMany(filters, pagination)` | `SELECT with WHERE + ORDER BY created_at DESC + LIMIT/OFFSET` | Dynamic filters via `and(...)` |

**NotificationChannelConfigsRepository:**
| Method | Drizzle Operation | Notes |
|--------|------------------|-------|
| `findAll()` | `SELECT * FROM notification_channel_configs` | Can be cached |
| `findByChannelType(type)` | `SELECT WHERE channel_type = $1` | Single row or null |
| `update(channelType, data)` | `UPDATE SET is_active, config_json, updated_at WHERE channel_type = $1` | Returns updated row |

### 7. Admin Controller

```
GET    /admin/notifications/logs              → listLogs(query)
GET    /admin/notifications/logs/:id          → getLogById(param)
GET    /admin/notifications/channels           → listChannelConfigs()
PATCH  /admin/notifications/channels/:channelType → updateChannelConfig(param, body)
```

All endpoints guarded by `JwtAuthGuard` + `RolesGuard` with `ORGANIZER` role.

### 8. DTOs

**Request DTO for query params:**
```typescript
const ListNotificationLogsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  channel: z.enum(["EMAIL", "TELEGRAM", "APP"]).optional(),
  type: z.enum([...notificationTypes]).optional(),
  userId: z.string().uuid().optional(),
  workshopId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

**Response DTOs:** Already exists (`NotificationLogResponse.from()`) — extend with paginated list DTO.

## Data Flow: End-to-End Example

```
1. PaymentsService.handleWebhook() succeeds
2. PaymentsService: await this.notificationQueue.add('payment.success', {
     notificationId: 'uuid-123',
     type: 'PAYMENT_SUCCESS',
     channel: 'EMAIL',
     recipient: 'student@uni.edu',
     payload: { workshopTitle: 'AI Workshop', amount: 50000 }
   })
3. POST /registrations returns HTTP 201 immediately (fire-and-forget)

4. BullMQ delivers job to NotificationWorker
5. Worker calls dispatchService.dispatch('uuid-123')
6. DispatchService loads notification_logs row → status PENDING
7. DispatchService loads channel_configs for EMAIL → is_active=true
8. DispatchService resolves channels.EMAIL → EmailChannel
9. EmailChannel.send() → logger.log('[EMAIL] To: student@uni.edu...')
10. DispatchService updates log → status SENT, sent_at = now()
11. Worker returns → job complete
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Notification log not found | `Result.fail(NOTIFICATION_LOG_NOT_FOUND)` — worker returns, no retry |
| Channel config not found | `Result.fail(NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND)` — worker returns, no retry |
| Channel not active | Update log to FAILED with reason — worker returns, no retry |
| Channel.send() fails | Update log to FAILED — worker throws → BullMQ retries (up to 5) |
| Unknown channel type | `Result.fail(NOTIFICATION_CHANNEL_UNKNOWN)` — worker returns, no retry |

**New error codes to add to `ErrorCode` union:**
- `NOTIFICATION_LOG_NOT_FOUND` (NOT_FOUND)
- `NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND` (NOT_FOUND)
- `NOTIFICATION_CHANNEL_INACTIVE` (BUSINESS)
- `NOTIFICATION_CHANNEL_UNKNOWN` (VALIDATION)

## Dependencies

```
NotificationWorker
  └── NotificationDispatchService
        ├── NotificationLogsRepository
        ├── NotificationChannelConfigsRepository
        ├── EmailChannel
        ├── TelegramChannel
        └── AppChannel

NotificationsAdminController
  └── NotificationsService
        ├── NotificationLogsRepository
        └── NotificationChannelConfigsRepository
```

Both services share the same repositories — this is intentional and safe since repositories are stateless data-access objects.

## Extensibility: Adding a New Channel

1. Create `background/channels/sms.channel.ts` implementing `INotificationChannel`
2. Add `SmsChannel` to `NotificationDispatchService` constructor + registry (+2 lines)
3. Add `"SMS"` to `notificationChannelEnum` in DB schema (migration)
4. Insert SMS config row into `notification_channel_configs`

No existing channel code is modified. The controller and admin service are unaffected.
