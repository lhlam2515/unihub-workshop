# UniHub Workshop — Backend Implementation Plan

**Phiên bản:** 2.0 | **Cập nhật:** April 28, 2026

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

Module IAM (18 files)
├── Controllers: 3
├── Services: 5
├── Repositories: 3
└── DTOs: 7

Module Catalog (26 files)
├── Controllers: 5
├── Services: 6
├── Repositories: 6
└── DTOs: 9

Module Booking (17 files)
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

Module Background (24 files)      ← NEW!
├── Controllers: 3
├── Services: 5
├── Workers: 3
├── Cron Jobs: 2
├── Repositories: 5
└── DTOs: 5
```

**Tổng cộng: ~120+ files (skeleton/placeholder)**

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

### Phase 2: Module IAM (2 tuần)

- [ ] Token lifecycle (sign, verify, blacklist)
- [ ] Auth endpoints (login, refresh, logout, /me)
- [ ] User admin operations
- [ ] Checkin staff assignments
- [ ] Student profile retrieval

---

### Phase 3: Module Catalog (2-3 tuần)

- [ ] Workshop CRUD with status management
- [ ] Room conflict detection
- [ ] Rooms & Speakers management
- [ ] Document upload & storage
- [ ] Seat counter initialization (Redis)

---

### Phase 4: Module Booking (3-4 tuần) — CRITICAL

**CRITICAL PATH: 12K CCU registrations/minute**

- [ ] All 5 Mechanics implementation:
  1. GlobalRateLimit → 2. RateLimiter (token bucket)
  2. SeatLock → 3. Idempotency → 4. CircuitBreaker
- [ ] Critical path registration flow
- [ ] Payment processing with webhooks
- [ ] 2-layer idempotency (Redis + DB)
- [ ] Pessimistic locking for payments

---

### Phase 5: Module Checkin (2 tuần)

- [ ] Ticket generation with QR tokens
- [ ] QR scanning for check-in
- [ ] Offline sync batch processing
- [ ] Workshop check-in statistics

---

### Phase 6: Module Background (2-3 tuần) — NEW

- [ ] Queue setup (Bull/BullMQ or EventEmitter2)
- [ ] Notification system (email, Telegram, retries)
- [ ] AI summary pipeline (Claude API)
- [ ] Student sync (CSV import)
- [ ] Cron jobs (payment timeout, reconciliation)
- [ ] System monitoring & circuit breaker

---

### Phase 7: Integration & Testing (3-4 tuần)

- [ ] End-to-end testing for all workflows
- [ ] Load testing (12K CCU)
- [ ] Security testing
- [ ] Performance optimization
- [ ] Monitoring & alerting setup

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

6. **System Monitoring**
   - Monitor cron job status
   - Track circuit breaker states
   - Provide admin endpoints for system health

### Files Created

- **Controllers (3):** notifications-admin, student-sync-admin, system-admin
- **Services (5):** notifications, notification-dispatch, ai-summary, student-sync, system-monitor
- **Workers (3):** notification, ai-summary, student-sync
- **Cron Jobs (2):** payment-timeout, reconciliation
- **Repositories (5):** notification-logs, channel-configs, sync-jobs, sync-errors, ai-summaries (shared)
- **DTOs (5):** notification-response, update-channel-config, trigger-student-sync, student-sync-response, system-monitor-response
- **Module (1):** background.module.ts

### Implementation Checklist

- [ ] Choose queue implementation (Bull/BullMQ vs EventEmitter2)
- [ ] Setup @nestjs/schedule for @Cron decorators
- [ ] Create all database tables for background jobs
- [ ] Implement notification dispatch with channel adapters
- [ ] Setup email provider (SMTP) & Telegram Bot API
- [ ] Implement AI summary pipeline with Claude integration
- [ ] Implement student CSV import with error tracking
- [ ] Implement cron jobs for timeout & reconciliation
- [ ] Setup distributed locks for concurrency control
- [ ] Implement system monitoring endpoints
- [ ] Test all workflows end-to-end

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

| Phase     | Scope                          | Duration        |
| --------- | ------------------------------ | --------------- |
| 1         | Foundation (Redis, Guards, DB) | 1-2 weeks       |
| 2         | IAM Module                     | 2 weeks         |
| 3         | Catalog Module                 | 2-3 weeks       |
| 4         | Booking (CRITICAL)             | 3-4 weeks       |
| 5         | Checkin Module                 | 2 weeks         |
| 6         | Background Module              | 2-3 weeks       |
| 7         | Integration & Testing          | 3-4 weeks       |
| **Total** |                                | **15-21 weeks** |

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

**Status: 🟢 SCAFFOLDING COMPLETE — Ready for Implementation**

---

## 📝 Additional Documentation

- **IMPLEMENTATION_PLAN.md** (this file) — Overall roadmap
- **FILE_STRUCTURE.md** — File structure summary
- **BACKGROUND_MODULE.md** — Background Module detailed guide
- **component-list.md** — Complete component specifications
