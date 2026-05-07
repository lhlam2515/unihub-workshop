# UniHub Workshop — API ↔ Module Mapping

> **Mục đích:** Ánh xạ tường minh từng API endpoint trong `api-design.md` sang module nội bộ của Backend API (NestJS Modular Monolith — section 1.2 của `01_architecture.md`).
> **Nguyên tắc:** URL path là **routing convention**, không phải ownership. Một endpoint dưới `/admin/workshops/{id}/...` có thể được sở hữu bởi module **không phải `catalog`** — quyết định ownership dựa trên **module sở hữu entity nghiệp vụ chính** mà endpoint thao tác.

---

## 1. Mười module và phạm vi

Tóm tắt từ `01_architecture.md` section 1.2:

| Module | Architectural Style | Loại | API surface? |
|---|---|---|:---:|
| `booking` | Layered + OO (Optimistic Locking) | Domain | ✅ |
| `catalog` | Layered | Domain | ✅ |
| `payment` | Event-Driven + Circuit Breaker | Domain | ✅ |
| `notification` | Event-Driven + Strategy Pattern | Domain | ✅ (admin) |
| `checkin` | Client-Server + Offline-First (Outbox) | Domain | ✅ |
| `ai-summary` | Pipe-and-Filter | Domain | ✅ |
| `csv-sync` | Batch-Sequential | Domain | ✅ (admin) |
| `iam` | Layered + OO | Domain | ✅ |
| `rate-limit` | Sliding Window Counter (Redis) | **Cross-cutting** | ❌ (Guard) |
| `background` | Cron + Workers | **Operational** | ❌ (Scheduler) |

**Phân loại ba nhóm:**

* **Domain module** (8 module) — sở hữu entity, expose REST endpoint, có Controller class.
* **Cross-cutting module** (`rate-limit`) — không expose endpoint riêng. Hiện thực qua NestJS Guard/Interceptor được apply lên endpoint của các domain module khác (`@RateLimit({ tier: 'per-user', quota: 10 })`).
* **Operational module** (`background`) — không expose endpoint riêng. Là tập hợp cron job + worker process tiêu thụ BullMQs.

---

## 2. Bảng mapping tổng — Endpoint × Module

Với mỗi endpoint:

* **Owner** = module có Controller class.
* **Calls** = module được gọi đồng bộ trong handler (in-process method call).
* **Emits** = sự kiện đẩy vào BullMQs hoặc EventEmitter để module khác tiêu thụ async.
* **Guards** = module áp dụng dưới dạng NestJS Guard/Middleware (luôn có `iam` cho endpoint authenticated, `rate-limit` cho endpoint giới hạn).

### 2.1. Module `iam`

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `POST /auth/login` | `iam` | — | — | `rate-limit(per-ip)` |
| `POST /auth/refresh` | `iam` | — | — | `rate-limit(per-ip)` |
| `POST /auth/logout` | `iam` | — | — | `iam(jwt)` |
| `GET /auth/me` | `iam` | — | — | `iam(jwt)` |
| `POST /device-tokens` | `iam` | — | — | `iam(jwt+role:student)` |
| `DELETE /device-tokens/{token}` | `iam` | — | — | `iam(jwt+role:student)` |

> **Note về device-tokens:** Mặc dù device tokens được `notification` module *tiêu thụ* (để dispatch push), bảng `device_tokens` thuộc bounded context Identity và có FK đến `students`. CRUD endpoint do đó nằm ở `iam`. `notification` chỉ inject `DeviceTokensRepository` (read-only) khi cần dispatch.

---

### 2.2. Module `catalog`

Sở hữu các entity: `workshops`, `rooms`, `speakers`. Bao gồm cả public read và admin CRUD.

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `GET /workshops` | `catalog` | — | — | `rate-limit(T1-ip)` |
| `GET /workshops/{id}` | `catalog` | `ai-summary` (read summary text) | — | `rate-limit(T2-user)` |
| `GET /workshops/{id}/availability` | `catalog` | — | — | `rate-limit(T2-user)` |
| `GET /rooms/{id}` | `catalog` | — | — | `rate-limit(T2-user)` |
| `GET /speakers/{id}` | `catalog` | — | — | `rate-limit(T2-user)` |
| `GET /admin/workshops` | `catalog` | — | — | `iam(role:btc)` |
| `GET /admin/workshops/{id}` | `catalog` | — | — | `iam(role:btc)` |
| `POST /admin/workshops` | `catalog` | — | — | `iam(role:btc)` |
| `PATCH /admin/workshops/{id}` | `catalog` | — | `workshop.changed` (nếu room/time đổi) | `iam(role:btc)` |
| `POST /admin/workshops/{id}/publish` | `catalog` | — | — | `iam(role:btc)` |
| `POST /admin/workshops/{id}/cancel` | `catalog` | `booking` (cancel registrations), `payment` (enqueue refunds) | `workshop.cancelled` (cho `notification` consume) | `iam(role:btc)` |
| `GET /admin/workshops/{id}/registrations` | `booking` | — | — | `iam(role:btc)` |
| `GET /admin/workshops/{id}/stats` | `catalog` | `booking` (count regs), `payment` (revenue), `checkin` (attendance) | — | `iam(role:btc)` |
| `GET/POST/PATCH /admin/speakers[/{id}]` | `catalog` | — | — | `iam(role:btc)` |
| `GET/POST/PATCH /admin/rooms[/{id}]` | `catalog` | — | — | `iam(role:btc)` |

> **`GET /admin/workshops/{id}/registrations` ownership:** URL có vẻ thuộc `catalog`, nhưng entity là `registrations` → owner là `booking`. NestJS routing cho phép Controller của `booking` đăng ký path nested này.

---

### 2.3. Module `booking`

Sở hữu entity: `registrations`, một phần `idempotency_keys` (resource_type='registration'), và **OL update trên `workshops.seats_available`** (write-side cộng tác với catalog).

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `POST /registrations` | `booking` | `catalog` (verify workshop open) | `registration.confirmed` (free) hoặc `registration.pending` (paid) | `iam(role:student)`, `rate-limit(T2-user, T3-user×workshop)` |
| `GET /registrations` | `booking` | — | — | `iam(role:student)` + row-level filter `student_id = JWT.sub` |
| `GET /registrations/{id}` | `booking` | — | — | `iam(role:student)` + ownership check |
| `DELETE /registrations/{id}` | `booking` | `payment` (nếu paid → refund) | `registration.cancelled` | `iam(role:student)` + ownership check |
| `GET /admin/workshops/{id}/registrations` | `booking` | — | — | `iam(role:btc)` |

**Cross-module dependency của `booking`:**

* **Read** từ `catalog`: lấy workshop để verify status='OPEN', đọc price.
* **Write** vào `workshops`: UPDATE `seats_available` + `version` (OL). Đây là điểm **write boundary giao thoa** — về mặt domain, ai update seat count? Có hai lựa chọn:
  * Option A (chọn): `booking` được phép write `workshops.seats_available` + `version`. `catalog` không expose method `decreaseSeats()` ra ngoài.
  * Option B: `catalog` expose `decreaseSeats(id, expectedVersion)`, `booking` gọi method này.
  * **Lựa chọn:** Option A — vì OL retry loop nằm hoàn toàn trong `booking` transaction. Option B sẽ tách transaction thành 2 service calls → mất ACID. Đây là **điểm thỏa hiệp ranh giới module** thường gặp trong Modular Monolith và là lý do cần document rõ.

---

### 2.4. Module `payment`

Sở hữu: `payments`, một phần `idempotency_keys` (resource_type='payment'), Circuit Breaker in-memory state, Reconciliation job.

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `POST /payments` | `payment` | `booking` (verify registration='PENDING'), Circuit Breaker check, gateway HTTP | `payment.succeeded` / `payment.failed` / `payment.unresolved` | `iam(role:student)`, `rate-limit(T2-user, T3-user×workshop)` |
| `GET /payments/{id}` | `payment` | — | — | `iam(role:student)` + ownership |
| `POST /payments/webhook/{gateway}` | `payment` | `booking` (update registration→paid) | `payment.succeeded` | **HMAC signature** (không JWT) |
| `GET /admin/system/circuit-breaker` | `payment` | — | — | `iam(role:btc)` |
| `POST /admin/system/circuit-breaker/{gateway}/reset` | `payment` | — | — | `iam(role:btc)` |
| `POST /admin/payments/reconcile` | `payment` | gateway query API | — | `iam(role:btc)` |

> **CB state:** In-memory, không có repository. `CircuitBreakerService` là stateful singleton trong process. Admin endpoints chỉ read/reset in-memory state — không query DB.
>
> **Reconcile endpoint:** Kích hoạt cùng `ReconciliationService` mà cron job dùng (không có code path mới). Concurrency guard bằng PostgreSQL advisory lock — trả 409 nếu cron đang chạy.

**Cross-module write:** Sau payment success, `payment` cần update `registrations.status='PAID'`. Tương tự booking↔catalog ở 2.3, đây là điểm cần thỏa thuận:

* `payment` *được phép* update `registrations.status` trực tiếp trong cùng transaction với INSERT payments? — **Có**, vì payment success là sự kiện đồng bộ với registration update.
* Hoặc emit event và `booking` consume để update? — **Không cho path đồng bộ** vì client đang đợi response 201 với QR. Event chỉ dùng cho side-effect không-blocking (notification).

---

### 2.5. Module `checkin`

Sở hữu: `checkins`. Đối tác đặc biệt với mobile schema (`checkin_queue`, `cached_registrations`).

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `GET /checkin/workshops/{id}/registrations` | `checkin` | `booking` (read registrations với filter status, paginated) | — | `iam(role:checkin_staff)` + `workshop_id ∈ allowed_workshop_ids` |
| `POST /checkins` | `checkin` | `booking` (resolve registration by qr_code) | `checkin.recorded` | `iam(role:checkin_staff)`, `rate-limit(per-user:60/m)` |
| `POST /checkins/sync` | `checkin` | `booking` (resolve qr_codes batch) | `checkin.recorded` × N | `iam(role:checkin_staff)`, `rate-limit(per-user:30/m)` |

> **Tại sao không phải `booking` sở hữu pre-load endpoint?** Vì endpoint này có **side concern** đặc biệt: trả `X-Total-Count` cho mobile populate `cache_metadata.server_total`, paginate batch lớn (200 items thay vì 20), filter cố định `status IN ('PAID','CONFIRMED')`. Đây là **API phục vụ mobile offline cache** — concern thuộc về `checkin`, không phải truy vấn registration thông thường.

---

### 2.6. Module `ai-summary`

Sở hữu: phần summary trên `workshops` (`pdf_url`, `summary_text`, `summary_status`) + BullMQ `summary-jobs`.

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `POST /admin/workshops/{id}/summary` | `ai-summary` | `catalog` (verify workshop exists) | `summary.queued` (job vào stream) | `iam(role:btc)` |
| `GET /admin/workshops/{id}/summary` | `ai-summary` | — | — | `iam(role:btc)` |
| `POST /admin/workshops/{id}/summary/retry` | `ai-summary` | — | `summary.queued` | `iam(role:btc)` |
| `PUT /admin/workshops/{id}/summary` | `ai-summary` | — | — | `iam(role:btc)` |

> **Read-side public:** `GET /workshops/{id}` ở module `catalog` có inline summary block. `catalog` đọc trực tiếp `workshops.summary_text` (không gọi vào `ai-summary` service) — vì đây là cùng row trong DB.

---

### 2.7. Module `csv-sync`

Sở hữu: `import_logs`. Tiêu thụ và write vào `students` (cross-module write tương tự booking↔catalog).

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `GET /admin/imports` | `csv-sync` | — | — | `iam(role:btc)` |
| `GET /admin/imports/{id}` | `csv-sync` | — | — | `iam(role:btc)` |
| `GET /admin/imports/{id}/errors` | `csv-sync` | — | — | `iam(role:btc)` |
| `POST /admin/imports/trigger` | `csv-sync` | — | (chính nó kích hoạt batch worker đồng bộ hoặc enqueue job) | `iam(role:btc)` |

**Cross-module write:** `csv-sync` upsert vào `students`. Thay vì gọi `iam.upsertStudent()`, `csv-sync` được phép write trực tiếp vì:

1. Đây là batch path không có business invariant phức tạp (chỉ là CSV → row).
2. `iam` không cần áp business rule khi import (không validate password, vì password_hash NULL — auth qua SSO/CSV import).

Nếu sau này thêm rule (vd: gửi welcome email cho student mới), refactor để emit `student.created` cho `notification` consume.

---

### 2.8. Module `notification`

Sở hữu: `notification_logs`, `notification_channel_configs`. **Không có endpoint cho user thường** — chỉ admin và internal event consumption.

| Endpoint | Owner | Calls | Emits | Guards |
|---|---|---|---|---|
| `GET /admin/notification-channels` | `notification` | — | — | `iam(role:btc)` |
| `PATCH /admin/notification-channels/{id}` | `notification` | — | — | `iam(role:btc)` |
| `GET /admin/notifications/logs` | `notification` | — | — | `iam(role:btc)` |

**Internal consumers (không phải HTTP endpoint):**

* Worker tiêu thụ BullMQ `queue: notification`.
* Strategy Pattern: `EmailChannel`, `InAppChannel` (FCM/APNs từ `device_tokens`), tương lai `TelegramChannel`.
* Mỗi channel xử lý isolated — failure ở một channel không ảnh hưởng channel khác (ADR-09).

---

### 2.9. Module `rate-limit` (cross-cutting)

**KHÔNG có endpoint.** Hiện thực dưới dạng NestJS Guard với decorator `@RateLimit(tiers)`:

```typescript
// POST /registrations — áp T2 + T3
@RateLimit([
  { tier: 'T2', key: (req) => `rl:user:${req.user.sub}`,          limit: 30, window: 60 },
  { tier: 'T3', key: (req) => `rl:reg:${req.user.sub}:${req.body.workshop_id}`, limit: 5, window: 60 },
])
@Post('registrations')
async create(...) { ... }

// GET /workshops — áp T1 only (unauthenticated)
@RateLimit([
  { tier: 'T1', key: (req) => `rl:ip:${req.ip}`, limit: 60, window: 60 },
])
@Get('workshops')
async list(...) { ... }
```

Internally:

* Guard chạy trước handler, kiểm tra T1 → T2 → T3 theo thứ tự, dừng ở tier vi phạm đầu tiên.
* Inject `RateLimitService` → ZADD + ZREMRANGEBYSCORE + ZCARD trong một Redis MULTI block.
* Vượt quota → throw `TooManyRequestsException` (HTTP 429) với `Retry-After` và `tier` field.
* **Fail-open khi Redis down** — không block request, không trả 5xx.

**3 tier (ADR-06, `rate-limiting.md`):**

* **T1 — IP** (`rl:ip:{ip}`, 60/60s) — unauthenticated endpoints. Sau login T1 không còn áp dụng.
* **T2 — User** (`rl:user:{user_id}`, 30/60s) — tất cả authenticated endpoints.
* **T3 — User×Workshop** (`rl:reg:{user_id}:{workshop_id}`, 5/60s) — chỉ `POST /registrations` và `POST /payments`. Bảo vệ OL hot-row contention, scope per workshop.

---

### 2.10. Module `background` (operational)

**KHÔNG có endpoint.** Tập hợp các **scheduled job** (cron) và **worker process** (BullMQ consumer).

#### 2.10.1. Cron jobs (định kỳ)

| Cron expression | Job | Module nghiệp vụ chính |
|---|---|---|
| `0 2 * * *` (2 AM hằng đêm) | CSV import — đọc `/input/students_*.csv`, upsert students | `csv-sync` |
| `*/5 * * * *` (mỗi 5 phút) | Reconcile unresolved payments — query `payments WHERE status='UNRESOLVED'`, gọi gateway query API | `payment` |
| `*/10 * * * *` | Notification retry — query `notification_logs WHERE status IN ('FAILED','TIMEOUT') AND retry_count < 3` | `notification` |
| `0 3 * * *` (3 AM hằng đêm) | Cleanup expired `idempotency_keys` (`expires_at < now()`) | shared utility, owner: `booking` (nó tạo nhiều keys nhất) |
| `0 4 * * *` | Cleanup `device_tokens` stale (`last_seen < now - 30d`) | `iam` |
| `*/1 * * * *` (mỗi phút) | DLQ scan — `stalled job detection (BullMQ built-in)` orphaned messages từ BullMQ (pending jobs > 5 phút) | `background` core |

#### 2.10.2. Workers (BullMQ consumer)

| Stream | Worker | Module nghiệp vụ chính |
|---|---|---|
| `queue: ai-summary` | AI Summary Worker — pipeline 4 stage: parse PDF → clean → AI call → store | `ai-summary` |
| `queue: notification` | Notification Worker — fanout sang Email/InApp channels qua Strategy Pattern | `notification` |
| `queue: refund` | Refund Worker — gọi gateway refund API cho registrations.cancelled từ paid | `payment` |
| `queue: ai-summary.dlq` | DLQ Inspector — chỉ log + alert, không tự retry | `background` core |

#### 2.10.3. Endpoint quản lý jobs (gợi ý — Stage 6)

Nếu cần observability cho ops, có thể thêm:

```
GET  /admin/jobs/streams              # Trạng thái queues + PEL size
GET  /admin/jobs/dlq                  # Danh sách messages trong DLQ
POST /admin/jobs/dlq/{id}/replay      # Manual replay từ DLQ về main stream
```

Owner: `background` module. Tuy nhiên không phải MVP của đồ án — có thể defer.

---

## 3. Dependency Graph giữa các module

Mũi tên = "import / call vào". Vòng cấm trong Modular Monolith — nếu phát hiện cycle, refactor dùng event hoặc shared kernel.

```
                         ┌──────────────────┐
                         │   rate-limit     │ ← Cross-cutting Guard
                         │   (cross-cutting)│   apply trên mọi domain module
                         └────────┬─────────┘
                                  │ Guard
                                  ▼
        ┌─────────┐    ┌──────────────────┐
        │   iam   │ ◄──┤ Mọi domain module│ ← JWT verify + RBAC
        └─────────┘    └────────┬─────────┘
                                │
            ┌───────────────────┼─────────────────────┐
            ▼                   ▼                     ▼
       ┌─────────┐         ┌─────────┐          ┌──────────┐
       │ catalog │ ◄───────│ booking │◄─────────│  payment │
       └────┬────┘         └────┬────┘          └────┬─────┘
            │                   │                    │
            │                   ▼                    ▼
            │              ┌─────────┐          ┌────────────┐
            │              │ checkin │          │notification│
            │              └─────────┘          └────────────┘
            │                                        ▲
            ▼                                        │
       ┌──────────┐                                  │
       │ai-summary│──────────────────────────────────┘
       └──────────┘                  emit events
       
       ┌──────────┐
       │ csv-sync │  (không depend module nào — chỉ write students)
       └──────────┘

       ┌────────────┐
       │ background │  (depend mọi module để consume queues + cron)
       └────────────┘
```

**Quy tắc đọc:**

* `booking` import `catalog` → vì cần verify workshop status='OPEN' và đọc price.
* `payment` import `booking` → vì cần verify registration='PENDING' và update→'PAID'.
* `checkin` import `booking` → vì cần resolve qr_code → registration.
* `ai-summary` không import module khác, chỉ cập nhật cột summary trên workshops.
* `notification` không import module khác — nó **chỉ consume event** từ BullMQs. Domain module emit event (đẩy vào stream) → notification worker tiêu thụ. **Đây là decoupling quan trọng** giúp tránh cycle khi `booking` muốn gửi confirmation và `payment` muốn gửi receipt.
* `background` import từ tất cả — vì worker chạy logic thuộc về domain module (vd: Reconciliation Worker chạy code của `payment.reconcileService`).

**Không có cycle.**

---

## 4. Pattern cross-module orchestration

### 4.1. Synchronous in-process call (NestJS DI)

Dùng khi cần kết quả ngay trong response cho client.

```
POST /registrations
  ├─ booking.RegistrationsController.create()
  │    ├─ inject CatalogService
  │    ├─ catalog.getWorkshop(id)        ← in-process method call
  │    ├─ <OL transaction logic>
  │    └─ event_bus.emit('registration.confirmed')   ← async fanout
  └─ Return 201 ngay sau OL commit (không đợi notification gửi xong)
```

### 4.2. Event emission qua BullMQs (async)

Dùng cho side-effect không cần block client.

```
booking.create() COMMIT thành công
  └─ addJob: notification {event: 'registration.confirmed', user_id, workshop_id, ...}

(parallel — không block response)
notification.NotificationsWorker
  ├─ @Processor từ stream
  ├─ Resolve channels active từ notification_channel_configs
  ├─ FOR EACH channel: dispatch via Strategy
  └─ Log vào notification_logs
```

### 4.3. Webhook (external → internal)

```
External Gateway → POST /payments/webhook/vnpay
  ├─ HMAC verify (không JWT)
  ├─ payment.WebhooksController.handle()
  ├─ Lookup payment by gateway_charge_id
  ├─ Update payments.status
  ├─ Update registrations.status = 'PAID'        ← cross-module write
  └─ Emit event → notification worker
```

### 4.4. Cron-triggered (background → domain)

```
Cron 2 AM
  └─ background.CronScheduler.run('csv-import')
       └─ csv-sync.ImportPipeline.run()    ← module nghiệp vụ giữ logic
            ├─ Parse CSV stream (500 rows/batch)
            ├─ INSERT ... ON CONFLICT DO UPDATE students
            └─ Write import_logs
```

`background` chỉ là **scheduler** — logic nằm ở domain module.

---

## 5. NestJS Module Tree (gợi ý cấu trúc thư mục)

```
src/
├── main.ts
├── app.module.ts
│
├── shared/                       # Shared kernel — types, utils dùng chung
│   ├── result/                   # Result<T> wrapper
│   ├── errors/                   # Error catalog (registration.workshop_full, ...)
│   └── decorators/
│
├── infra/                        # Infrastructure adapters (không phải module nghiệp vụ)
│   ├── database/                 # Drizzle ORM, connection pool
│   ├── redis/                    # ioredis client (3 logical DBs)
│   ├── http-client/              # Axios cho gateway, AI provider
│   └── messaging/                # BullMQs + BullMQ wrapper
│
├── modules/
│   ├── iam/
│   │   ├── controllers/          # AuthController, DeviceTokensController
│   │   ├── services/             # AuthService, JwtService
│   │   ├── guards/               # JwtAuthGuard, RolesGuard
│   │   ├── repositories/         # StudentsRepo, StaffRepo, DeviceTokensRepo
│   │   └── iam.module.ts
│   │
│   ├── rate-limit/
│   │   ├── guards/               # RateLimitGuard
│   │   ├── decorators/           # @RateLimit({ tier, quota })
│   │   ├── services/             # SlidingWindowService
│   │   └── rate-limit.module.ts
│   │
│   ├── catalog/
│   │   ├── controllers/          # WorkshopsController (public + admin), RoomsController, SpeakersController
│   │   ├── services/             # WorkshopsService, CacheAsideService
│   │   ├── repositories/         # WorkshopsRepo (read), RoomsRepo, SpeakersRepo
│   │   └── catalog.module.ts
│   │
│   ├── booking/
│   │   ├── controllers/          # RegistrationsController
│   │   ├── services/             # RegistrationsService, OptimisticLockService, IdempotencyService (chia sẻ với payment)
│   │   ├── repositories/         # RegistrationsRepo, IdempotencyKeysRepo, WorkshopsWriteRepo
│   │   └── booking.module.ts
│   │
│   ├── payment/
│   │   ├── controllers/          # PaymentsController, WebhooksController
│   │   ├── services/             # PaymentsService, CircuitBreakerService, ReconciliationService
│   │   ├── gateways/             # VnpayGateway, StripeGateway, MockGateway (Strategy Pattern)
│   │   ├── repositories/         # PaymentsRepo
│   │   └── payment.module.ts
│   │
│   ├── checkin/
│   │   ├── controllers/          # CheckinsController, CheckinSyncController
│   │   ├── services/             # CheckinsService, SyncBatchService
│   │   ├── repositories/         # CheckinsRepo
│   │   └── checkin.module.ts
│   │
│   ├── ai-summary/
│   │   ├── controllers/          # SummaryController
│   │   ├── services/             # SummaryService, PdfParser, TextCleaner, AiCaller (Pipe-and-Filter stages)
│   │   ├── providers/            # OpenAIProvider, ClaudeProvider (Strategy)
│   │   └── ai-summary.module.ts
│   │
│   ├── csv-sync/
│   │   ├── controllers/          # ImportsController
│   │   ├── services/             # ImportPipeline, RowValidator, BatchUpserter
│   │   ├── repositories/         # ImportLogsRepo, StudentsWriteRepo
│   │   └── csv-sync.module.ts
│   │
│   ├── notification/
│   │   ├── controllers/          # NotificationChannelsController, NotificationLogsController
│   │   ├── services/             # NotificationDispatcher, ChannelRegistry
│   │   ├── channels/             # EmailChannel, InAppChannel, TelegramChannel (Strategy)
│   │   ├── workers/              # NotificationWorker (BullMQ consumer)
│   │   ├── repositories/         # NotificationLogsRepo, ChannelConfigsRepo
│   │   └── notification.module.ts
│   │
│   └── background/
│       ├── cron/                 # Schedulers — gọi vào domain services
│       ├── workers/              # Worker bootstrappers — gọi vào domain workers
│       └── background.module.ts
```

**Quy tắc import giữa module:**

* Domain module có thể import nhau theo dependency graph ở section 3 (no cycle).
* Mọi module import `iam` cho Guard. `iam` không import module nào.
* Mọi module áp `rate-limit` qua decorator. `rate-limit` không import module nào.
* `notification` không import domain module nào — chỉ tiêu thụ event qua BullMQs.
* `background` import mọi module nó cần trigger (vd: import `csv-sync` để gọi pipeline).

---

## 6. Bảng tóm tắt cuối — Module × ADR × Endpoint cluster

| Module | ADR liên quan | Endpoint cluster | # endpoint |
|---|---|---|:---:|
| `iam` | ADR-04, ADR-05 | `/auth/*`, `/device-tokens` | 6 |
| `catalog` | ADR-13 | `/workshops`, `/rooms`, `/speakers`, `/admin/workshops`, `/admin/speakers`, `/admin/rooms` | 13 |
| `booking` | ADR-03, ADR-08, **ADR-15** | `/registrations`, `/admin/workshops/{id}/registrations` | 5 |
| `payment` | ADR-07, ADR-08, **ADR-15** | `/payments`, `/payments/webhook/*`, `/admin/system/circuit-breaker/*`, `/admin/payments/reconcile` | 6 |
| `checkin` | ADR-11 | `/checkins`, `/checkins/sync`, `/checkin/workshops/{id}/registrations` | 3 |
| `ai-summary` | ADR-14 | `/admin/workshops/{id}/summary` (4 verbs) | 4 |
| `csv-sync` | ADR-12 | `/admin/imports/*` | 4 |
| `notification` | ADR-09 | `/admin/notification-channels`, `/admin/notifications/logs` | 3 |
| `rate-limit` | ADR-06 | (không có endpoint — Guard) | 0 |
| `background` | (orchestration của các ADR khác) | (không có endpoint MVP) | 0 |
| **Tổng** | | | **~44 endpoint** |

> **Note 1:** `/admin/workshops/{id}/stats` tính trong cluster `catalog` vì Controller class nằm trong `catalog` — `booking`/`payment`/`checkin` chỉ expose query method.
>
> **Note 2:** `payment` tăng từ 3 → 6 endpoint sau khi bổ sung CB monitoring + reconcile trigger (Gap 5 từ gap analysis). ADR-15 được add vào `booking` và `payment` vì hai module này sở hữu các endpoint có `Idempotency-Key` header.

---

## 7. Checklist nhất quán với `01_architecture.md`

✅ 10 module được liệt kê đúng tên (`booking`, `catalog`, `payment`, `notification`, `checkin`, `ai-summary`, `csv-sync`, `iam`, `rate-limit`, `background`).
✅ Architectural style của từng module được phản ánh trong API design (vd: `payment` có Circuit Breaker check trước gateway call; `ai-summary` upload trả 202 Accepted vì pipeline async).
✅ ADR map 1-1: ADR-03 ↔ booking, ADR-07/08 ↔ payment, ADR-09 ↔ notification, ADR-11 ↔ checkin, ADR-13 ↔ catalog, ADR-14 ↔ ai-summary, ADR-12 ↔ csv-sync, ADR-04/05 ↔ iam, ADR-06 ↔ rate-limit, **ADR-15 ↔ booking + payment** (Idempotency-Key header transport).
✅ Layered architecture (Presentation → Business → Data Access) được giữ trong cấu trúc thư mục mỗi module (`controllers/` → `services/` → `repositories/`).
✅ Dependency graph không có cycle.
✅ `rate-limit` và `background` không expose endpoint — đúng vai trò cross-cutting/operational.
✅ Webhook (`/payments/webhook/{gateway}`) dùng auth khác (HMAC) — đúng với mô tả "tích hợp external" trong section 1.5 của architecture.
✅ CB admin endpoints (`GET/POST /admin/system/circuit-breaker/*`) và Reconcile (`POST /admin/payments/reconcile`) thuộc `payment` module — không tạo module mới vì đây là operational surface của `payment`, không phải domain mới.
✅ Rate limit tier T1/T2/T3 (ADR-06) nhất quán trong tất cả Guards column của mapping tables.
