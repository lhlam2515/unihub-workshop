# UniHub Workshop — Backend Implementation Plan

**Phiên bản:** 2.1 | **Cập nhật:** May 2, 2026

---

## 📋 Tổng Quan Dự Án

Dự án UniHub Workshop là một nền tảng quản lý workshop đại học với hỗ trợ:

- **12.000 CCU** cho luồng đăng ký (critical path)
- **Thanh toán đa cổng** (VNPAY, MOMO, STRIPE)
- **Check-in offline** cho mobile app
- **Quản lý tài liệu** và AI summarization
- **Hệ thống thông báo** (Email, Telegram)
- **Đồng bộ hóa sinh viên** (CSV import)
- **Giám sát hệ thống** (Cron jobs, circuit breaker)

### 🏗️ Tech Stack

| Phần            | Công Nghệ                                |
| --------------- | ---------------------------------------- |
| Framework       | NestJS 10+                               |
| Database        | PostgreSQL 15+ (Drizzle ORM)             |
| Cache/Queue     | Redis (ioredis)                          |
| Validation      | Zod                                      |
| Auth            | JWT (jsonwebtoken)                       |
| Queue Jobs      | Bull/BullMQ (hoặc EventEmitter2 cho MVP) |
| Scheduled Tasks | @nestjs/schedule                         |
| File Storage    | Object Storage (S3/Azure)                |
| AI              | Anthropic Claude API                     |

---

## 📁 Cấu Trúc Module

### Module List

```
Core (4 Guards)
├── jwt-auth.guard.ts
├── roles.guard.ts
├── workshop-scope.guard.ts
└── hmac-signature.guard.ts

Shared (4 Decorators + Redis Module)
├── decorators/
│   ├── roles.decorator.ts
│   ├── public.decorator.ts
│   ├── current-user.decorator.ts
│   └── idempotency-key.decorator.ts
└── redis/
    ├── redis.module.ts
    └── redis.service.ts

Module IAM (19 files)
├── Controllers: 3
├── Services: 5
├── Repositories: 4
└── DTOs: 7

Module Catalog (32 files)
├── Controllers: 5
├── Services: 7
├── Repositories: 6
└── DTOs: 11

Module Booking (19 files)
├── Controllers: 2
├── Services: 3
├── Mechanics: 5
├── Repositories: 2
└── DTOs: 5

Module Checkin (13 files)
├── Controllers: 2
├── Services: 3
├── Repositories: 2
└── DTOs: 6

Module Background (29 files)
├── Controllers: 3
├── Services: 5
├── Workers: 3
├── Cron Jobs: 2
├── Repositories: 5
└── DTOs: 8
```

**Tổng cộng: ~112+ files (server modules)** + core/shared (~30 files)

---

## 🔄 Implementation Phases

### Phase 1: Foundation (1-2 tuần)

**1.1 Core Infrastructure**

- [x] Setup Redis Module
- [x] Implement Guards (JwtAuth, Roles, WorkshopScope, HmacSignature)
- [x] Setup GlobalExceptionFilter & ResponseInterceptor
- [x] Create Drizzle schema and migrations
- [x] Create database indexes

**1.2 Database Setup**

- [x] Create all tables (identity, transaction, event-core, async)
- [x] Setup relationships and constraints
- [x] Create indexes for critical queries

---

### Phase 2: Module IAM (2 tuần) ✅

- [x] Token lifecycle (sign, verify, blacklist)
- [x] Auth endpoints (login, refresh, logout, /me)
- [x] User admin operations
- [x] Checkin staff assignments
- [x] Student profile retrieval

---

### Phase 3: Module Catalog (2-3 tuần) ✅

- [x] Workshop CRUD with status management
- [x] Room conflict detection
- [x] Rooms & Speakers management
- [x] Document upload & storage (S3 Object Storage)
- [x] Seat counter initialization (Redis)
- [x] Workshop emergency update (room/time changes on PUBLISHED)
- [x] Workshop auto-completion (cron: past PUBLISHED → COMPLETED)
- [x] AI summary tracking (PENDING→DONE/FAILED lifecycle, public/admin views, retry)

**Emergent specs:** `workshop-emergency-update`, `workshop-completion`, `ai-summary-tracking`

---

### Phase 4: Module Booking (3-4 tuần) — CRITICAL ✅

**CRITICAL PATH: 12K CCU registrations/minute**

- [x] All 5 Mechanics implementation:
  1. GlobalRateLimit → 2. RateLimiter (token bucket)
  2. SeatLock → 3. Idempotency → 4. CircuitBreaker
- [x] Critical path registration flow
- [x] Payment processing with webhooks
- [x] 2-layer idempotency (Redis + DB)
- [x] Pessimistic locking for payments
- [x] Shared BullMQ queue infrastructure foundation
- [x] Notification dispatch system (email, telegram, app)

**Emergent spec:** `queue-infrastructure` (shared BullMQ module with typed event contracts)

---

### Phase 5: Module Checkin (2 tuần) ✅

- [x] Ticket generation with QR tokens
- [x] QR scanning for check-in (online + offline)
- [x] Offline sync batch processing (idempotent ON CONFLICT DO NOTHING)
- [x] Check-in status dashboard per workshop (confirmed, checked-in, pending counts)
- [x] Ticket preload endpoint for mobile offline cache
- [x] Silent token refresh on 401 during sync

**Emergent spec:** `checkin-preload` (mobile offline ticket cache API)

**Note:** Check-in statistics view (`v_workshop_checkin_stats`) exists in DB schema; API endpoint `GET /checkin/workshops/:id/status` documented in API design.

---

### Phase 6: Module Background (2-3 tuần) ✅

- [x] Queue setup (BullMQ — shared infrastructure)
- [x] Notification dispatch (email, Telegram, Strategy pattern adapters, exponential backoff 5 attempts)
- [x] AI summary pipeline (Claude API, 5-stage: upsert → extract → clean → LLM → save, 40s timeout)
- [x] Student CSV sync pipeline (batch upsert, error tracking, 4 job statuses)
- [x] Cron jobs (payment timeout 1m, reconciliation 10m, circuit breaker recovery 30s)
- [x] System monitoring endpoints (cron status, circuit breaker view/reset)

**Specs:** `background-cron-jobs`, `student-csv-sync-pipeline`, `ai-summary-pipeline`, `notification-dispatch`

---

### Phase 7: Integration & Testing (3-4 tuần) — CURRENT

- [ ] End-to-end testing for all workflows
- [ ] Load testing (12K CCU):
  - Registration endpoint: 7,200 req / 3 min burst
  - Notification throughput: 10K+ / hour
  - AI summary processing capacity
  - Payment gateway failover
- [ ] Security testing:
  - IDOR vulnerability scan (OWASP ZAP or similar)
  - Refresh token XSS protection (HttpOnly Secure SameSite=Strict verification)
  - Redis blacklist revocation < 1s
  - Rate limit bypass attempts
  - SQL injection (via Drizzle)
  - HMAC signature verification for webhook endpoints
- [ ] Performance optimization:
  - NFR targets: Registration API < 300ms, Online QR scan < 1s, Offline QR scan < 200ms
  - Redis AOF persistence (everysec)
  - Connection pool tuning
- [ ] Database views coverage:
  - `v_workshop_availability` — reporting view
  - `v_workshop_checkin_stats` — check-in statistics for admin dashboard
- [ ] Monitoring & alerting setup:
  - Queue job status
  - Cron job execution
  - API response times
  - Circuit breaker state
  - Rate limit violations

---

## 🚀 Background Module (Phase 6) — Chi Tiết

### Responsibilities

1. **Notifications** (Email, Telegram)
   - Triggered by: registration confirmed, payment success, workshop cancelled
   - Retry logic: exponential backoff, max 5 retries
   - Audit trail in `notification_logs`

2. **AI Summarization** (Claude API)
   - Triggered by: document upload
   - Pipeline: Extract → Clean → LLM → Save
   - Timeout: 30s for LLM call

3. **Student Sync** (CSV Import)
   - Triggered by: POST /admin/student-sync
   - Returns 202 Accepted immediately
   - Batch-sequential processing with error tracking
   - Distributed lock prevents parallel jobs

4. **Payment Timeout** (Cron)
   - Schedule: Every 1 minute
   - Expire pending payments, release seats, cancel registrations

5. **Reconciliation** (Cron)
   - Schedule: Every 10 minutes
   - Compare Redis seat counters with DB
   - Log discrepancies (safety net, not source of truth)

6. **Circuit Breaker Recovery** (Cron)
   - Schedule: Every 30 seconds
   - Transition OPEN → HALF_OPEN after 30s cooldown
   - Supports VNPAY, MOMO, STRIPE gateways

7. **System Monitoring**
   - Monitor cron job status (payment-timeout, reconciliation)
   - View and reset circuit breaker states (admin endpoints)
   - Provide admin endpoints for system health

### Files Created

- **Controllers (3):** notifications-admin, student-sync-admin, system-admin
- **Services (5):** notifications, notification-dispatch, ai-summary, student-sync, system-monitor
- **Workers (3):** notification, ai-summary, student-sync
- **Cron Jobs (2):** payment-timeout, reconciliation
- **Repositories (5):** notification-logs, channel-configs, sync-jobs, sync-errors, ai-summaries (shared)
- **DTOs (5):** notification-response, update-channel-config, trigger-student-sync, student-sync-response, system-monitor-response
- **Module (1):** background.module.ts

### Implementation Checklist (All completed in Phase 6)

- [x] Choose queue implementation — BullMQ (shared infrastructure)
- [x] Setup @nestjs/schedule for @Cron decorators
- [x] Create all database tables for background jobs
- [x] Implement notification dispatch with channel adapters (Email, Telegram)
- [x] Setup email provider (SMTP) & Telegram Bot API (mock)
- [x] Implement AI summary pipeline with Claude integration
- [x] Implement student CSV import with error tracking
- [x] Implement cron jobs for timeout & reconciliation + circuit breaker recovery
- [x] Setup distributed locks for concurrency control
- [x] Implement system monitoring endpoints
- [x] Test all workflows end-to-end

---

## 🔑 Key Implementation Details

### Critical Path (12K CCU)

**Registration Flow (in order):**

1. Global rate limit check (500 req/s)
2. Per-user rate limit (5 tokens, 1/10s refill)
3. DECR Redis seat counter (optimistic)
4. Check DB UNIQUE constraint
5. INSERT registration (CONFIRMED if free, PENDING if paid)
6. Issue ticket if confirmed

**Payment Processing:**

- Pessimistic lock with 3s timeout
- Layer 1 idempotency: Redis SET NX
- Layer 2 idempotency: DB UNIQUE constraint
- Circuit breaker for gateway failover

### Queue Configuration

**Bull/BullMQ** (Recommended):

- Persistent job storage
- Built-in retry logic
- Job progress tracking
- Dead letter queue

**EventEmitter2** (MVP):

- No external service
- Simple implementation
- No persistence (jobs lost on restart)

### Background Job Patterns

- **Notification:** Exponential backoff (5s, 10s, 20s, 40s, 80s)
- **AI Summary:** Timeout fatal, retry for other errors
- **Student Sync:** Distributed lock, batch-sequential processing

---

## 📅 Timeline & Milestones

| Phase     | Scope                          | Duration        | Status     |
| --------- | ------------------------------ | --------------- | ---------- |
| 1         | Foundation (Redis, Guards, DB) | 1-2 weeks       | ✅ Done    |
| 2         | IAM Module                     | 2 weeks         | ✅ Done    |
| 3         | Catalog Module                 | 2-3 weeks       | ✅ Done    |
| 4         | Booking (CRITICAL)             | 3-4 weeks       | ✅ Done    |
| 5         | Checkin Module                 | 2 weeks         | ✅ Done    |
| 6         | Background Module              | 2-3 weeks       | ✅ Done    |
| 7         | Integration & Testing          | 3-4 weeks       | 🔄 Current |
| **Total** |                                | **15-21 weeks** | —          |

---

## ✅ Testing Strategy

### Unit Tests

- Service business logic
- Repository CRUD operations
- Mechanic algorithms (rate limit, circuit breaker)
- Cron job logic (mocked time)

### Integration Tests

- Critical path registration flow
- Payment webhook handling
- Notification delivery with retries
- AI summary pipeline
- Student sync with error tracking
- Cron job execution

### Load Testing

- 12K concurrent registrations/minute
- Notification throughput (10K+/hour)
- AI summary processing capacity
- Payment gateway failover

### Security Testing

- IDOR vulnerabilities
- JWT token validation
- HMAC signature verification
- Rate limit bypass
- SQL injection (via Drizzle)

---

## 🚀 Deployment

### Environment Variables

See BACKGROUND_MODULE.md for queue, notification, AI, and background job config.

### Monitoring & Alerts

- Queue job status
- Cron job execution
- API response times
- Circuit breaker state
- Rate limit violations

---

**Status: 🟢 ALL PHASES 1–6 COMPLETE — Phase 7 (Integration & Testing) in Progress**

---

## 📝 Additional Documentation

- **IMPLEMENTATION_PLAN.md** (this file) — Overall roadmap
- **FILE_STRUCTURE.md** — File structure summary
- **BACKGROUND_MODULE.md** — Background Module detailed guide
- **component-list.md** — Complete component specifications
- **`openspec/specs/`** — 28 Gherkin spec files covering all 50 FRs
- **`docs/srs.md`** — Full SRS with 50 FRs, 42 BRs, traceability matrix
- **`docs/blueprint/`** — Original architecture design decisions (ADR), storage strategy, API design
