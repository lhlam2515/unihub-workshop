# Design: Registration Flow

## Architecture Overview

The registration flow is a **5-stage pipeline** in `RegistrationsService.register()`. Each stage is a gate that can short-circuit with a specific error. Only requests that pass all gates reach the database.

```
POST /registrations
  → JwtAuthGuard + RolesGuard (STUDENT)
    → ZodValidationPipe (CreateRegistrationSchema)
      → Controller.register()
        → Service.register()
          ┌──────────────────────────────────────────┐
          │ Stage 1: GlobalRateLimitMechanic.check() │  ← 500 req/s sliding window
          │ Stage 2: RateLimiterMechanic.consume()   │  ← Token Bucket per user
          │ Stage 3: SeatCounterService.decrement()  │  ← Atomic DECR + rollback
          │ Stage 4: UNIQUE check (student, workshop)│  ← DB constraint
          │ Stage 5: Create Registration             │  ← Free → CONFIRMED / Paid → PENDING
          └──────────────────────────────────────────┘
```

## Mechanic 1: RateLimiterMechanic (Token Bucket)

**Algorithm:** Token Bucket with lazy refill, stored as Redis Hash.

**Key:** `ratelimit:register:{userId}`
**Fields:** `tokens` (int), `last_refill_at` (unix ms)
**Config:** capacity = 5, refill_rate = 1 token / 10 seconds, TTL = 300s

```
consumeToken(userId):
  1. HGETALL ratelimit:register:{userId}
  2. If empty → init: tokens=4 (5-1 consumed now), last_refill_at=now, TTL=300 → return OK
  3. elapsed_ms = now - last_refill_at
  4. new_tokens = floor(elapsed_ms / 10000)  // 1 per 10s
  5. tokens = min(capacity, current_tokens + new_tokens) - 1
  6. If tokens < 0 → return RATE_LIMIT_EXCEEDED (retry_after: time until next token)
  7. HSET tokens, last_refill_at → return OK
```

**Why Redis Hash over plain key:** The bucket needs two fields (tokens + timestamp) that must be read and written atomically. A Hash gives us field-level access without JSON parse overhead. We accept the tiny race window on refill (two concurrent requests may both see the same elapsed time) because:
- The penalty is at most 1 extra token granted, not a security issue
- A Lua script would eliminate the race but adds complexity disproportionate to the risk

## Mechanic 2: GlobalRateLimitMechanic (Sliding Window)

**Algorithm:** Simple INCR + EXPIRE as a 1-second fixed window.

**Key:** `ratelimit:global:register`
**Threshold:** 500 requests/second

```
check():
  1. INCR ratelimit:global:register
  2. If result == 1 → EXPIRE 1 (first request in window sets TTL)
  3. If result > 500 → return RATE_LIMIT_EXCEEDED
  4. Return OK
```

**Why 1-second fixed window over sliding window:** A true sliding window (sorted set with per-request timestamps) would be more accurate but costs O(log N) per request. At 500 req/s, the fixed window is simple, fast (O(1)), and the edge case (burst at window boundary allowing up to 1000 req across two windows) is acceptable because the per-user Token Bucket already limits individual burst.

## Mechanic 3: SeatLockMechanic (Redis SET NX)

**Purpose:** Hold a seat for 15 minutes while the student pays.

**Key:** `seat:lock:{workshopId}:{registrationId}`
**Value:** JSON `{ studentId, amount, createdAt }`
**TTL:** 900 seconds (15 minutes)

```
acquire(workshopId, registrationId, studentId, amount):
  1. payload = { studentId, amount, createdAt: now }
  2. SET NX seat:lock:{wid}:{rid} payload EX 900
  3. If OK → return OK
  4. If key exists → return SEAT_LOCK_EXPIRED (shouldn't happen with UUID key)

release(workshopId, registrationId):
  1. DEL seat:lock:{wid}:{rid}
  2. Return OK (idempotent — no error if key missing)

check(workshopId, registrationId):
  1. TTL seat:lock:{wid}:{rid}
  2. If TTL > 0 → return { valid: true, remainingSeconds: TTL }
  3. If TTL <= 0 → return SEAT_LOCK_EXPIRED
```

## Service: RegistrationsService.register() — Full Orchestration

```typescript
async register(studentId: string, dto: CreateRegistrationDto): Promise<Result<RegistrationResponseDto>> {
  // 1. Fetch workshop to determine is_paid + validate exists/published
  const workshopResult = await this.workshopsService.getPublishedById(dto.workshop_id);
  if (workshopResult.isFailure) return workshopResult.propagate();

  const workshop = workshopResult.data;

  // 2. Global rate limit (system-wide 500 req/s)
  const globalCheck = await this.globalRateLimit.check();
  if (globalCheck.isFailure) return globalCheck.propagate();

  // 3. Per-user rate limit (Token Bucket)
  const userCheck = await this.rateLimiter.consumeToken(studentId);
  if (userCheck.isFailure) return userCheck.propagate();

  // 4. Atomic seat decrement
  const seatResult = await this.seatCounter.decrement(dto.workshop_id);
  if (seatResult.isFailure) {
    // If workshop was free, no lock to release. Just propagate.
    return seatResult.propagate();
  }

  // 5. Check duplicate registration (UNIQUE constraint guard)
  const existing = await this.registrationsRepo.findByStudentAndWorkshop(studentId, dto.workshop_id);
  if (existing.isSuccess && existing.data) {
    // Rollback seat
    await this.seatCounter.increment(dto.workshop_id);
    return Result.fail(registrationErrors.duplicate(studentId, dto.workshop_id));
  }

  // 6. Determine status
  const status = workshop.isPaid ? 'PENDING_PAYMENT' : 'CONFIRMED';

  // 7. Insert registration
  const regResult = await this.registrationsRepo.create({
    studentId, workshopId: dto.workshop_id, status,
    confirmedAt: status === 'CONFIRMED' ? new Date() : null,
  });
  if (regResult.isFailure) {
    await this.seatCounter.increment(dto.workshop_id);
    return regResult.propagate();
  }
  const registration = regResult.data;

  // 8a. If paid: acquire seat lock
  if (workshop.isPaid) {
    const lockResult = await this.seatLock.acquire(
      dto.workshop_id, registration.registrationId, studentId, Number(workshop.price)
    );
    if (lockResult.isFailure) {
      // Compensation: mark registration as CANCELLED, INCR seat
      await this.registrationsRepo.updateStatus(registration.registrationId, 'CANCELLED');
      await this.seatCounter.increment(dto.workshop_id);
      return lockResult.propagate();
    }
  }

  // 8b. If free: issue ticket immediately
  if (!workshop.isPaid) {
    // TODO: Full ticket issuance is F06. For now, create ticket row with placeholder QR.
    const ticketResult = await this.ticketsRepo.create({
      registrationId: registration.registrationId,
      qrToken: crypto.randomUUID(), // placeholder — F06 will replace with signed QR
      status: 'ACTIVE',
    });
    // Ticket failure is non-fatal for registration; log and continue
  }

  // 9. Build response
  const response = RegistrationResponseBuilder.from(registration, {
    payment_deadline: workshop.isPaid ? new Date(Date.now() + 900_000) : undefined,
    amount: workshop.isPaid ? Number(workshop.price) : undefined,
  });

  return Result.ok(response);
}
```

## Compensating Actions (Rollback on Failure)

Each stage after DECR has a defined compensation if it fails:

| Stage | Failure | Compensation |
|-------|---------|-------------|
| DECR | Returns < 0 | INCR (done inside SeatCounterService) |
| UNIQUE check | Duplicate found | INCR seat |
| DB insert | DB error | INCR seat |
| SeatLock acquire | Redis error | UPDATE status=CANCELLED + INCR seat |

## Data Flow

```
Controller (thin)                    Service (orchestration)              Repository (data access)
─────────────────                    ─────────────────────────            ─────────────────────────
@CurrentUser() → studentId  ────→   register(studentId, dto)    ────→    findByStudentAndWorkshop()
@Body() → CreateRegistrationDto      ├─ workshopsService.get()           create()
                                     ├─ globalRateLimit.check()          updateStatus()
                                     ├─ rateLimiter.consumeToken()
                                     ├─ seatCounter.decrement()
                                     ├─ registrationsRepo.*()
                                     ├─ seatLock.acquire() [if paid]
                                     └─ ticketsRepo.create() [if free]
```

## Redis Key Summary

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `ratelimit:register:{userId}` | Hash | 300s | Per-user token bucket |
| `ratelimit:global:register` | String (counter) | 1s | System-wide request cap |
| `seat:available:{workshopId}` | String (counter) | None | Real-time seat count |
| `seat:lock:{workshopId}:{registrationId}` | String (JSON) | 900s | Paid workshop seat hold |

## Error Mapping

| Scenario | Error Code | HTTP |
|----------|-----------|------|
| Token bucket empty | RATE_LIMIT_EXCEEDED | 429 |
| Global limit hit | RATE_LIMIT_EXCEEDED | 429 |
| No seats left | SEAT_UNAVAILABLE | 422 |
| Already registered | REGISTRATION_DUPLICATE | 409 |
| Workshop not found | WORKSHOP_NOT_FOUND | 404 |
| Workshop not published | WORKSHOP_NOT_PUBLISHED | 422 |
| Workshop cancelled | WORKSHOP_CANCELLED | 422 |
| Registration not found | REGISTRATION_NOT_FOUND | 404 |
| Already cancelled | REGISTRATION_CANCELLED | 409 |
| Seat lock expired | SEAT_LOCK_EXPIRED | 410 |
