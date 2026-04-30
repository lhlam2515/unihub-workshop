# Tasks: Implement Registration Flow

## Dependency Order

```
Mechanics → Repository → Response DTOs → Service → Controller → Verify
```

---

## Group 1: Mechanics (Load Control Foundation)

### Task 1.1: Implement RateLimiterMechanic.consumeToken() ✅
- **File:** `apps/server/src/modules/booking/mechanics/rate-limiter.mechanic.ts`
- **Depends on:** RedisService (already implemented)
- **What:**
  - Implement Token Bucket algorithm using Redis Hash `ratelimit:register:{userId}`
  - Fields: `tokens` (int), `last_refill_at` (unix ms)
  - Capacity: 5, refill: 1 token/10s, key TTL: 300s
  - Return `Result.ok(true)` if token consumed, `Result.fail(rateLimitError(...))` if empty
  - Include `retry_after` seconds in error context
- **Acceptance:** FR-F04-001 scenarios pass ✅

### Task 1.2: Implement GlobalRateLimitMechanic.check() ✅
- **File:** `apps/server/src/modules/booking/mechanics/global-rate-limit.mechanic.ts`
- **Depends on:** RedisService
- **What:**
  - INCR `ratelimit:global:register`, EXPIRE 1 on first request
  - Threshold: 500 requests/second
  - Return `Result.ok(true)` if under threshold, `Result.fail(rateLimitError(...))` if exceeded
- **Acceptance:** FR-F04-001 global limit scenarios pass ✅

### Task 1.3: Implement SeatLockMechanic (acquire, release, check) ✅
- **File:** `apps/server/src/modules/booking/mechanics/seat-lock.mechanic.ts`
- **Depends on:** RedisService
- **What:**
  - `acquire(workshopId, registrationId, studentId, amount)`: SET NX `seat:lock:{wid}:{rid}` with JSON payload, EX 900
  - `release(workshopId, registrationId)`: DEL key (idempotent)
  - `check(workshopId, registrationId)`: TTL check, return `{ valid, remainingSeconds }` or `SEAT_LOCK_EXPIRED`
- **Acceptance:** FR-F04-004 seat lock scenarios pass ✅

---

## Group 2: Repository (Data Access)

### Task 2.1: Implement RegistrationsRepository.findByStudentAndWorkshop() ✅
- **File:** `apps/server/src/modules/booking/repositories/registrations.repository.ts`
- **Depends on:** DatabaseModule (injected)
- **What:** Query `registrations` where `student_id = ? AND workshop_id = ?`, exclude CANCELLED
- **Acceptance:** Returns registration row or null ✅

### Task 2.2: Implement RegistrationsRepository.create() ✅
- **File:** `apps/server/src/modules/booking/repositories/registrations.repository.ts`
- **Depends on:** DatabaseModule
- **What:** INSERT into `registrations`, return created row. Support optional transaction (`tx`)
- **Acceptance:** Row inserted, all fields populated ✅

### Task 2.3: Implement RegistrationsRepository.updateStatus() ✅
- **File:** `apps/server/src/modules/booking/repositories/registrations.repository.ts`
- **Depends on:** DatabaseModule
- **What:** UPDATE `status` (and `confirmed_at`/`cancelled_at` based on status), SET `updated_at = now()`. Support optional `tx`
- **Acceptance:** Row updated atomically ✅

### Task 2.4: Implement RegistrationsRepository.findMyRegistrations() ✅
- **File:** `apps/server/src/modules/booking/repositories/registrations.repository.ts`
- **Depends on:** DatabaseModule
- **What:** SELECT registrations WHERE `student_id = ?`, optional status filter, optional pagination. JOIN with workshops for title
- **Acceptance:** Returns filtered, paginated list ✅

### Task 2.5: Implement RegistrationsRepository.cancelAllForWorkshop() ✅
- **File:** `apps/server/src/modules/booking/repositories/registrations.repository.ts`
- **Depends on:** DatabaseModule
- **What:** UPDATE all CONFIRMED/PENDING_PAYMENT registrations for a workshop to CANCELLED. Must run in transaction (`tx` required)
- **Acceptance:** All matching rows updated, count returned ✅

---

## Group 3: Response DTOs

### Task 3.1: Implement RegistrationResponseBuilder.from() ✅
- **File:** `apps/server/src/modules/booking/dto/registration-response.dto.ts`
- **Depends on:** Registration DB type
- **What:** Map a Registration row (plus optional payment_deadline, amount) to `RegistrationDto`. Return all fields including `payment_deadline` and `amount` when applicable
- **Acceptance:** Returns clean DTO with no internal DB fields leaked ✅

### Task 3.2: Implement RegistrationResponseBuilder.fromWithDetails() ✅
- **File:** `apps/server/src/modules/booking/dto/registration-response.dto.ts`
- **Depends on:** RegistrationResponseBuilder.from(), workshop/ticket types
- **What:** Extend `from()` with workshop summary, ticket info, payment info when provided
- **Acceptance:** Returns full detail DTO with related entities ✅

---

## Group 4: Service (Business Logic)

### Task 4.1: Implement RegistrationsService.register() ✅
- **File:** `apps/server/src/modules/booking/services/registrations.service.ts`
- **Depends on:** All mechanics (1.1–1.3), repository (2.1–2.2), SeatCounterService (from CatalogModule), WorkshopsService (from CatalogModule)
- **What:**
  - Full 5-stage pipeline as designed in design.md
  - Fetch workshop → global rate limit → per-user rate limit → DECR seat → UNIQUE check → INSERT registration → (SeatLock if paid / Ticket if free) → Response
  - Compensating actions on failure after DECR
  - Ticket creation stubbed (placeholder QR token — F06 will replace)
- **Acceptance:** FR-F04-003 and FR-F04-004 scenarios pass ✅

### Task 4.2: Implement RegistrationsService.getMyRegistrations() ✅
- **File:** `apps/server/src/modules/booking/services/registrations.service.ts`
- **Depends on:** RegistrationsRepository.findMyRegistrations() (2.4)
- **What:** Delegate to repository with studentId from JWT. Build response DTOs with workshop summary
- **Acceptance:** FR-F04-006 list scenarios pass ✅

### Task 4.3: Implement RegistrationsService.getRegistrationDetail() ✅
- **File:** `apps/server/src/modules/booking/services/registrations.service.ts`
- **Depends on:** RegistrationsRepository, IDOR enforcement
- **What:** Find registration by ID. If not found OR student_id != jwt.sub → return REGISTRATION_NOT_FOUND (IDOR)
- **Acceptance:** FR-F04-006 detail scenarios pass ✅

### Task 4.4: Implement RegistrationsService.cancelRegistration() ✅
- **File:** `apps/server/src/modules/booking/services/registrations.service.ts`
- **Depends on:** RegistrationsRepository.updateStatus() (2.3), SeatCounterService, SeatLockMechanic
- **What:**
  - Find registration, verify ownership (IDOR)
  - If already CANCELLED → REGISTRATION_CANCELLED
  - UPDATE status = CANCELLED
  - VOID ticket if exists
  - INCR seat counter
  - Release seat lock if paid workshop
- **Acceptance:** FR-F04-005 scenarios pass ✅

---

## Group 5: Controller (HTTP Layer)

### Task 5.1: Implement POST /registrations endpoint ✅
- **File:** `apps/server/src/modules/booking/controllers/registrations.controller.ts`
- **Depends on:** RegistrationsService.register() (4.1)
- **What:**
  - `@Post()` with `@Body()` validated by ZodValidationPipe (CreateRegistrationSchema)
  - Extract studentId from `@CurrentUser()`
  - Call service, return Result
- **Acceptance:** HTTP 201 on success, proper error codes on failure ✅

### Task 5.2: Implement GET /students/me/registrations endpoint ✅
- **File:** `apps/server/src/modules/booking/controllers/registrations.controller.ts`
- **Depends on:** RegistrationsService.getMyRegistrations() (4.2)
- **What:** Extract studentId from `@CurrentUser()`, pass optional query filters
- **Acceptance:** Returns paginated list ✅

### Task 5.3: Implement GET /students/me/registrations/:id endpoint ✅
- **File:** `apps/server/src/modules/booking/controllers/registrations.controller.ts`
- **Depends on:** RegistrationsService.getRegistrationDetail() (4.3)
- **What:** Extract studentId from `@CurrentUser()`, pass registration id from `@Param()`
- **Acceptance:** Returns detail or 404 ✅

### Task 5.4: Implement DELETE /registrations/:id endpoint ✅
- **File:** `apps/server/src/modules/booking/controllers/registrations.controller.ts`
- **Depends on:** RegistrationsService.cancelRegistration() (4.4)
- **What:** Extract studentId from `@CurrentUser()`, pass registration id from `@Param()`
- **Acceptance:** Returns 200 on success, 404/409 on failure ✅

---

## Group 6: Build & Verify

### Task 6.1: Build, lint, and type-check ✅
- **What:** Run `pnpm build`, `pnpm lint`, `pnpm check-types` for the server
- **Acceptance:** All pass with zero errors ✅

### Task 6.2: Verify against specs ✅
- **What:** Cross-reference implementation against `specs/registration-load-control.md` and `specs/registration-lifecycle.md`
- **Acceptance:** All scenarios covered, all requirements satisfied ✅
