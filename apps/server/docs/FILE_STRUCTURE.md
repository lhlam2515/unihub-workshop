# UniHub Workshop — File Structure Summary

**Tạo: April 28, 2026**
**Tổng File: ~145 files**
**Status: Skeleton/Placeholder — Ready for Implementation**

---

## 📊 File Statistics

| Thành Phần            | Số Lượng | Loại                                                                      |
| --------------------- | -------- | ------------------------------------------------------------------------- |
| **Core**              | 4        | Guards                                                                    |
| **Shared**            | 6        | Decorators (4) + Redis Module (2)                                         |
| **IAM Module**        | 18       | Controllers (3), Services (5), Repos (3), DTOs (7)                        |
| **Catalog Module**    | 26       | Controllers (5), Services (6), Repos (6), DTOs (9)                        |
| **Booking Module**    | 17       | Controllers (2), Services (3), Mechanics (5), Repos (2), DTOs (5)         |
| **Checkin Module**    | 13       | Controllers (2), Services (3), Repos (2), DTOs (6)                        |
| **Background Module** | 24       | Controllers (3), Services (5), Workers (3), Cron (2), Repos (5), DTOs (5) |
| **Documentation**     | 3        | Implementation Plan, File Structure, Background Module Guide              |
| **Total**             | ~115     | Implementation files + documentation                                      |

---

## 📁 Chi Tiết Cấu Trúc

### Core Guards (`src/core/guards/`)

```
jwt-auth.guard.ts              [✓] JWT validation + blacklist check
roles.guard.ts                 [✓] RBAC enforcement
workshop-scope.guard.ts        [✓] Workshop scope validation
hmac-signature.guard.ts        [✓] Payment webhook signature verification
```

### Shared (`src/shared/`)

**Decorators** (`decorators/`)

```
roles.decorator.ts             [✓] @Roles() — set role metadata
public.decorator.ts            [✓] @Public() — skip JWT auth
current-user.decorator.ts      [✓] @CurrentUser() — extract JWT payload
idempotency-key.decorator.ts   [✓] @IdempotencyKey() — extract header
```

**Redis Module** (`redis/`)

```
redis.module.ts                [✓] Global module provider
redis.service.ts               [✓] ioredis wrapper with primitives
```

### Module IAM (`src/modules/iam/`)

**Controllers (3):** auth, users-admin, checkin-staff-admin
**Services (5):** auth, token, users, student-profile, checkin-staff-assignment
**Repositories (3):** users, students, checkin-staff-assignments
**DTOs (7):** login, login-response, refresh-token, auth-me-response, update-user-status, assign-workshops, user-response

### Module Catalog (`src/modules/catalog/`)

**Controllers (5):** workshops-public, workshops-admin, rooms-admin, speakers-admin, documents-admin
**Services (6):** workshops, room-conflict, rooms, speakers, documents, seat-counter
**Repositories (6):** workshops, workshop-slots, rooms, speakers, workshop-documents, ai-summaries
**DTOs (9):** create-workshop, update-workshop, emergency-update-workshop, list-workshops-query, create-room, create-speaker, workshop-response, room-response, speaker-response, document-response, ai-summary-response

### Module Booking (`src/modules/booking/`)

**Controllers (2):** registrations, payments
**Services (3):** registrations, payments, payment-gateway
**Mechanics (5):** rate-limiter, seat-lock, idempotency, circuit-breaker, global-rate-limit
**Repositories (2):** registrations, payments
**DTOs (5):** create-registration, create-payment, payment-webhook, registration-response, payment-response

### Module Checkin (`src/modules/checkin/`)

**Controllers (2):** checkin, tickets
**Services (3):** checkin, ticket, offline-sync
**Repositories (2):** tickets, checkin-records
**DTOs (6):** scan-qr, offline-sync, ticket-response, checkin-status, sync-result

### Module Background (`src/modules/background/`) ← NEW!

**Controllers (3)**

- notifications-admin.controller.ts
- student-sync-admin.controller.ts
- system-admin.controller.ts

**Services (5)**

- notifications.service.ts
- notification-dispatch.service.ts
- ai-summary.service.ts
- student-sync.service.ts
- system-monitor.service.ts

**Workers (3)**

- notification.worker.ts
- ai-summary.worker.ts
- student-sync.worker.ts

**Cron Jobs (2)**

- payment-timeout.cron.ts
- reconciliation.cron.ts

**Repositories (5)**

- notification-logs.repository.ts
- notification-channel-configs.repository.ts
- ai-summaries.repository.ts (shared with Catalog)
- student-sync-jobs.repository.ts
- student-sync-errors.repository.ts

**DTOs (5)**

- notification-response.dto.ts
- update-channel-config.dto.ts
- trigger-student-sync.dto.ts
- student-sync-response.dto.ts
- system-monitor-response.dto.ts

**Module**

- background.module.ts

---

## 🔗 Module Dependencies

```
Background Module
  ├── imports: DatabaseModule, RedisModule, CatalogModule, BookingModule
  │   ├── needs: AiSummariesRepository (from Catalog)
  │   └── needs: Payment data (from Booking)
  └── provides: System monitoring, notification dispatch

Booking Module
  ├── imports: DatabaseModule, RedisModule, CatalogModule
  │   └── needs: SeatCounterService
  └── provides: RegistrationsService, PaymentsService

Checkin Module
  ├── imports: DatabaseModule, CatalogModule, BookingModule
  │   └── needs: Workshop info, Registration data
  └── provides: TicketService

Catalog Module
  ├── imports: DatabaseModule, RedisModule
  └── provides: WorkshopsService, SeatCounterService, AiSummariesRepository

IAM Module
  ├── imports: DatabaseModule, RedisModule
  └── provides: AuthService, TokenService, UsersService
```

---

## 📋 Implementation Checklist

### Foundation Phase

- [ ] Setup all TODO implementations in Guard files
- [ ] Implement RedisService primitives
- [ ] Setup Drizzle schema and migrations
- [ ] Create database indexes

### Module IAM

- [ ] Implement TokenService (JWT + blacklist)
- [ ] Implement AuthService (login flow)
- [ ] Implement UsersService (admin operations)
- [ ] Implement Repositories
- [ ] Test auth endpoints

### Module Catalog

- [ ] Implement WorkshopsService & Repository
- [ ] Implement RoomConflictService
- [ ] Implement RoomsService, SpeakersService
- [ ] Implement SeatCounterService
- [ ] Implement DocumentsService
- [ ] Test all endpoints

### Module Booking (Critical)

- [ ] Implement all Mechanics (rate limiter, seat lock, etc.)
- [ ] Implement RegistrationsService (critical path)
- [ ] Implement PaymentsService (webhook handling)
- [ ] Implement PaymentGatewayService
- [ ] Load test with 12K CCU
- [ ] Verify idempotency (Layer 1 + 2)

### Module Checkin

- [ ] Implement TicketService (QR generation)
- [ ] Implement CheckinService (QR scanning)
- [ ] Implement OfflineSyncService
- [ ] Test offline sync flow

### Module Background (NEW)

- [ ] Setup queue library (Bull/BullMQ or EventEmitter2)
- [ ] Implement notification system (email/telegram)
- [ ] Implement AI summary pipeline (Claude API)
- [ ] Implement student sync (CSV import)
- [ ] Implement cron jobs (timeout, reconciliation)
- [ ] Implement system monitoring

### Integration & Testing

- [ ] E2E tests for each module
- [ ] Load testing (12K CCU)
- [ ] Security testing (IDOR, SQL injection, etc.)
- [ ] Performance profiling

---

## 🚀 Quick Start

1. **Đọc IMPLEMENTATION_PLAN.md** — Hiểu rõ overall roadmap
2. **Đọc BACKGROUND_MODULE.md** — Chi tiết về background tasks
3. **Phase 1: Foundation** — Redis, Guards, Database
4. **Phase 2: IAM** — Authentication
5. **Phase 3: Catalog** — Workshop management
6. **Phase 4: Booking** — CRITICAL PATH (load test!)
7. **Phase 5: Checkin** — QR scanning
8. **Phase 6: Background** — Async jobs & scheduled tasks
9. **Phase 7: Integration** — End-to-end testing & optimization

---

## 📝 Key Notes

- ✅ **All file structures created** — Just need implementation
- ✅ **All DTOs have Zod schemas** — Ready for validation
- ✅ **All Services return Result<T>** — Railway Oriented Programming
- ✅ **Repositories support transactions** — For ACID operations
- ✅ **Module exports configured** — Clear dependencies
- ✅ **Background Module complete** — With 24 skeleton files
- ⚠️ **TODO comments throughout** — Mark implementation locations
- ⚠️ **Test critical path thoroughly** — 12K CCU is serious
- ⚠️ **Configure queue library** — Bull/BullMQ or EventEmitter2

---

**Created: April 28, 2026**
**Status: Ready for Development 🟢**

See BACKGROUND_MODULE.md for detailed Background Module implementation guide.
