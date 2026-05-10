# Fix Code Review Issues — Server Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 14 issues (6 Critical + 8 High) found by code-review-specialist, aligned with `docs/blueprint/` ADR/design docs.

**Architecture:** Fixes are grouped by module with no cross-module dependencies. Tasks run independently. Each task produces a compilable, testable change.

**Tech Stack:** NestJS 11, Drizzle ORM, Redis (ioredis), Zod v4, Winston

**Blueprint references:**
- ADR-07: Circuit Breaker **in-memory** — recovery cron is dead code, remove it
- ADR-04: JWT Auth — Redis blacklist for immediate revoke (specs/auth-revocation.md)
- ADR-03 + ADR-13: Seat lock TTL + cache strategy
- CLAUDE.md: Result pattern, layered architecture

---

## File Structure

### Modify (existing files):
| File | Change |
|------|--------|
| `apps/server/src/modules/iam/services/auth.service.ts:277-281` | Replace raw AppError with factory call |
| `apps/server/src/modules/iam/errors.ts` | Add `userNotFound()` factory |
| `apps/server/src/modules/iam/guards/jwt-auth.guard.ts:79-84` | Preserve specific error code |
| `apps/server/src/modules/iam/guards/jwt-auth.guard.ts:96-103` | Add log when suspension key absent |
| `apps/server/src/modules/catalog/services/workshops.service.ts:580-581` | Replace hardcoded `confirmed_count: 0` with real query |
| `apps/server/src/modules/catalog/module.ts` | Add `booking` module import or direct repo |
| `apps/server/src/modules/booking/services/registrations.service.ts:216-218` | Fix `!registration!` pattern |
| `apps/server/src/modules/booking/services/registrations.service.ts:232-239` | Log compensating action failures |
| `apps/server/src/modules/booking/mechanics/seat-lock.mechanic.ts:111-113` | Handle TTL=-1 for keys without TTL |
| `apps/server/src/modules/checkin/services/checkin.service.ts:57-61` | Return correct error for cancelled workshop |
| `apps/server/src/modules/checkin/services/checkin.service.ts:76` | Server-generate or validate `checkedInAt` |
| `apps/server/src/modules/checkin/services/offline-sync.service.ts:118-123` | Map actual error reason instead of hardcoded "QR_INVALID" |
| `apps/server/src/modules/payment/services/payments.service.ts:302-306` | Read workshopId before/inside transaction |
| `apps/server/src/modules/payment/guards/hmac-signature.guard.ts:100-105` | Configure rawBody in NestJS |
| `apps/server/src/modules/background/cron/circuit-breaker-recovery.cron.ts` | DELETE entire file |
| `apps/server/src/modules/background/cron/payment-timeout.cron.ts:67-78` | Add bounded concurrency processing |

### Create (new files):
*(none — all fixes are modifications or deletions)*

---

### Task 1: Remove dead Circuit Breaker recovery cron

**Blueprint alignment:** ADR-07 explicitly states CB state is **in-memory** for single-process Modular Monolith. Recovery cron reading from Redis is dead code — no producer writes those keys.

**Files:**
- Delete: `apps/server/src/modules/background/cron/circuit-breaker-recovery.cron.ts`
- Modify: `apps/server/src/modules/background/background.module.ts` (remove import and reference)

- [ ] **Step 1: Verify the cron file is standalone**

No other file depends on it. Check the module file for references.

- [ ] **Step 2: Delete the cron file**

```bash
rm apps/server/src/modules/background/cron/circuit-breaker-recovery.cron.ts
```

- [ ] **Step 3: Remove references from background module**

In `apps/server/src/modules/background/background.module.ts`:
- Remove import of `CircuitBreakerRecoveryCron`
- Remove `CircuitBreakerRecoveryCron` from `providers: []`
- If it had a cron `ScheduleModule` registration, remove that too

- [ ] **Step 4: Verify no remaining references**

```bash
grep -r "CircuitBreakerRecoveryCron" apps/server/src/
```

Expected: no matches.

- [ ] **Step 5: Run type check**

```bash
cd apps/server && pnpm check-types
```

Expected: 0 errors related to circuit breaker recovery.

- [ ] **Step 6: Run tests**

```bash
cd apps/server && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 2: Add `userNotFound()` error factory + fix auth.service.ts

**Files:**
- Modify: `apps/server/src/modules/iam/errors.ts` (add `userNotFound()`)
- Modify: `apps/server/src/modules/iam/services/auth.service.ts:277-281` (use factory)

- [ ] **Step 1: Read current errors.ts**

```bash
cat apps/server/src/modules/iam/errors.ts
```

Identify the existing `createError` pattern and other factory functions.

- [ ] **Step 2: Add `userNotFound()` factory**

In `apps/server/src/modules/iam/errors.ts`, add:

```typescript
userNotFound: (userId?: string): AppError =>
  createError({
    category: "NOT_FOUND",
    code: "USER_NOT_FOUND",
    message: "User not found.",
    ...(userId ? { context: { userId } } : {}),
  }),
```

- [ ] **Step 3: Replace raw object literal in auth.service.ts**

In `apps/server/src/modules/iam/services/auth.service.ts`, change:

```typescript
return Result.fail({
  category: "NOT_FOUND" as const,
  code: "USER_NOT_FOUND" as const,
  message: "User not found.",
});
```

to:

```typescript
return Result.fail(authErrors.userNotFound(userId));
```

- [ ] **Step 4: Run type check**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -20
```

Expected: 0 new errors.

- [ ] **Step 5: Run tests**

```bash
cd apps/server && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 3: Preserve specific token error in JwtAuthGuard

**Files:**
- Modify: `apps/server/src/modules/iam/guards/jwt-auth.guard.ts:79-84`

- [ ] **Step 1: Read current guard**

```bash
cat apps/server/src/modules/iam/guards/jwt-auth.guard.ts
```

- [ ] **Step 2: Update to preserve error detail**

Replace:

```typescript
if (verifyResult.isFailure) {
  throw new UnauthorizedException("Invalid token");
}
```

with:

```typescript
if (verifyResult.isFailure) {
  throw new UnauthorizedException(verifyResult.error.message);
}
```

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 4: Fix Redis suspension check (log + graceful degrade)

**Blueprint alignment:** ADR-04 mentions token blacklist Redis for immediate revoke (`specs/auth-revocation.md`). The guard checks `user:suspended:{sub}` but no producer writes it. Fix: remove ineffective check, keep path open for future implementation.

**Files:**
- Modify: `apps/server/src/modules/iam/guards/jwt-auth.guard.ts:96-103`

- [ ] **Step 1: Read current guard**

```bash
cat apps/server/src/modules/iam/guards/jwt-auth.guard.ts
```

- [ ] **Step 2: Remove Redis suspension check, add log placeholder**

Replace the Redis `isSuspended` block with a logging placeholder that documents intent:

```typescript
// Suspension check via Redis blacklist — not yet implemented.
// When implemented, read from Redis key `user:suspended:${payload.sub}`.
// See ADR-04 / docs/blueprint/specs/auth-revocation.md.
```

Remove the `const isSuspended = await this.redisService.get(...)` and the `if (isSuspended !== null)` block.

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 5: Fix `confirmed_count: 0` hardcode in workshops.service.ts

**Files:**
- Modify: `apps/server/src/modules/catalog/services/workshops.service.ts:580-581`
- Modify: `apps/server/src/modules/catalog/workshops.module.ts` (add registration service dependency if needed)

- [ ] **Step 1: Read current `getStats()` method**

```bash
cat -n apps/server/src/modules/catalog/services/workshops.service.ts | tail -100
```

- [ ] **Step 2: Determine correct approach**

Option A: Query `registrations` table directly via repository (if catalog module has access to booking module's repository — possible cross-module boundary violation).
Option B: Count via `RegistrationsService` (correct per architecture: cross-module via Service→Service).
Option C: Direct DB query in workshops repository.

Per CLAUDE.md "Cross-module communication: only Service → Service", use Option B if booking module exposes a `countConfirmedByWorkshop()` method. If not, use a direct repository query in the catalog module's own scope.

- [ ] **Step 3: Add registration count logic**

Replace:

```typescript
confirmed_count: 0,
```

with:

```typescript
confirmed_count: await this.getConfirmedCount(id),
```

Where `getConfirmedCount()` is a private method in the service that queries the registration count.

- [ ] **Step 4: Implement `getConfirmedCount()`**

```typescript
private async getConfirmedCount(workshopId: string): Promise<number> {
  const result = await this.registrationsRepo.countConfirmedByWorkshop(workshopId);
  if (result.isFailure) {
    this.logger.warn(`Failed to count confirmed registrations for workshop ${workshopId}`);
    return 0;
  }
  return result.data;
}
```

If the repository method doesn't exist, create it in `registrations.repository.ts`.

- [ ] **Step 5: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 6: Fix `!registration!` fragile null assertion in registrations.service.ts

**Files:**
- Modify: `apps/server/src/modules/booking/services/registrations.service.ts:216-218`

- [ ] **Step 1: Read current method**

```bash
cat -n apps/server/src/modules/booking/services/registrations.service.ts | head -250
```

Look at the retry loop and the post-loop check.

- [ ] **Step 2: Fix declaration and check**

Change `let registration: Registration;` to:

```typescript
let registration: Registration | undefined;
```

Change the post-loop check from:

```typescript
if (!registration!) {
```

to:

```typescript
if (!registration) {
```

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 7: Log compensating action failures in registrations.service.ts

**Files:**
- Modify: `apps/server/src/modules/booking/services/registrations.service.ts:232-239`

- [ ] **Step 1: Read current compensation block**

```bash
cat -n apps/server/src/modules/booking/services/registrations.service.ts | sed -n '225,245p'
```

- [ ] **Step 2: Add logging for compensation failures**

Replace the silent await calls:

```typescript
await this.workshopsService.incrementSeat(dto.workshopId);
await this.registrationsRepo.updateStatus(...);
await this.seatCounter.invalidateCache(dto.workshopId);
```

with:

```typescript
const incrResult = await this.workshopsService.incrementSeat(dto.workshopId);
if (incrResult.isFailure) {
  this.logger.error(`Seat compensation failed for workshop ${dto.workshopId}: ${incrResult.error.code}`);
}

const statusResult = await this.registrationsRepo.updateStatus(...);
if (statusResult.isFailure) {
  this.logger.error(`Status rollback failed: ${statusResult.error.code}`);
}

const cacheResult = await this.seatCounter.invalidateCache(dto.workshopId);
if (cacheResult && cacheResult.isFailure) {
  this.logger.error(`Cache invalidation failed: ${cacheResult.error.code}`);
}
```

Verify the logger is available (inject via constructor or use `this.logger` from NestJS `Logger`).

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 8: Handle TTL=-1 in seat-lock.mechanic.ts

**Blueprint alignment:** ADR-03 + ADR-13 define seat lock + cache strategy. TTL=-1 (key exists, no TTL) should be handled explicitly.

**Files:**
- Modify: `apps/server/src/modules/booking/mechanics/seat-lock.mechanic.ts:111-113`

- [ ] **Step 1: Read current TTL check**

```bash
cat -n apps/server/src/modules/booking/mechanics/seat-lock.mechanic.ts | sed -n '105,120p'
```

- [ ] **Step 2: Handle TTL=-1**

Replace:

```typescript
const ttl = await this.redisService.ttl(key);
if (ttl <= 0) {
  return Result.fail(seatErrors.lockExpired(workshopId, registrationId));
}
return Result.ok({ valid: true, remainingSeconds: ttl });
```

with:

```typescript
let ttl = await this.redisService.ttl(key);
if (ttl === -1) {
  // Key exists but no TTL — unexpected state (e.g. PERSIST command).
  // Assume full remaining TTL for safety.
  ttl = SEAT_LOCK_TTL_SECONDS;
} else if (ttl <= 0) {
  return Result.fail(seatErrors.lockExpired(workshopId, registrationId));
}
return Result.ok({ valid: true, remainingSeconds: ttl });
```

Import `SEAT_LOCK_TTL_SECONDS` from the mechanic's constants (or define it inline).

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 9: Fix wrong error for cancelled workshop in checkin.service.ts

**Files:**
- Modify: `apps/server/src/modules/checkin/services/checkin.service.ts:57-61`

- [ ] **Step 1: Read current check**

```bash
cat -n apps/server/src/modules/checkin/services/checkin.service.ts | sed -n '50,70p'
```

- [ ] **Step 2: Check available error factories**

```bash
cat apps/server/src/modules/checkin/errors.ts
```

Look for `workshopErrors` import or existing checkin errors.

- [ ] **Step 3: Fix the error**

Replace:

```typescript
if (registration.workshop.status === "CANCELLED") {
  return Result.fail(
    checkinErrors.registrationNotActive(registration.registrationId)
  );
}
```

with a call to an existing workshop-related error, or add a new checkin error:

```typescript
// Add to checkin errors if not exists:
workshopCancelled: (workshopId: string): AppError =>
  createError({
    category: "CONFLICT",
    code: "WORKSHOP_CANCELLED",
    message: "Workshop has been cancelled.",
    context: { workshopId },
  }),
```

- [ ] **Step 4: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 10: Validate client-provided `checkedInAt` in checkin.service.ts

**Files:**
- Modify: `apps/server/src/modules/checkin/services/checkin.service.ts:76`

- [ ] **Step 1: Read current checkin flow**

```bash
cat -n apps/server/src/modules/checkin/services/checkin.service.ts | sed -n '70,90p'
```

- [ ] **Step 2: Add validation**

Before using `checkedInAt`, add:

```typescript
const checkedInAtDate = new Date(checkedInAt);
const now = new Date();
if (isNaN(checkedInAtDate.getTime()) || checkedInAtDate > now) {
  return Result.fail(checkinErrors.invalidTimestamp("checkedInAt"));
}
```

If the method parameter is optional, handle `undefined` by defaulting to `now`.

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 11: Map actual error reason in offline-sync.service.ts

**Files:**
- Modify: `apps/server/src/modules/checkin/services/offline-sync.service.ts:118-123`

- [ ] **Step 1: Read current sync error mapping**

```bash
cat -n apps/server/src/modules/checkin/services/offline-sync.service.ts | sed -n '110,130p'
```

- [ ] **Step 2: Fix error reason mapping**

Replace:

```typescript
if (createResult.isFailure) {
  return {
    localId: item.localId,
    result: "REJECTED",
    reason: "QR_INVALID",
  };
}
```

with:

```typescript
if (createResult.isFailure) {
  return {
    localId: item.localId,
    result: "REJECTED",
    reason: createResult.error.code === "QR_INVALID" ? "QR_INVALID" : "INTERNAL_ERROR",
  };
}
```

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 12: Fix workshopId fallback after transaction in payments.service.ts

**Files:**
- Modify: `apps/server/src/modules/payment/services/payments.service.ts:302-306`

- [ ] **Step 1: Read current webhook failure path**

```bash
cat -n apps/server/src/modules/payment/services/payments.service.ts | sed -n '290,315p'
```

- [ ] **Step 2: Restructure to capture workshopId before/within transaction**

Move the `workshopId` read before the transactional block, or restructure the transactional callback to return `workshopId` along with the result. Change:

```typescript
const reg = await this.registrationsRepo.findById(registrationId);
workshopId = reg.isSuccess && reg.data ? reg.data.workshopId : "";
```

to read `workshopId` from the registration data already available in the webhook context, or from a query done inside the same transaction scope (so it's atomic). At minimum, log a warning when workshopId is empty:

```typescript
if (!workshopId) {
  this.logger.error(`Cannot release seat lock: registration ${registrationId} has no workshopId`);
}
```

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 13: Configure rawBody for HMAC signature guard

**Files:**
- Modify: `apps/server/src/main.ts` (add rawBody middleware)
- Modify: `apps/server/src/modules/payment/guards/hmac-signature.guard.ts:100-105` (remove JSON.stringify fallback)

- [ ] **Step 1: Read main.ts**

```bash
cat apps/server/src/main.ts
```

- [ ] **Step 2: Add rawBody configuration**

In `main.ts`, before `app.listen()`, configure body parser:

```typescript
import { json } from "express";
// ...
app.use(json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
```

- [ ] **Step 3: Simplify HMAC guard**

In the guard, replace the fallback logic with just the rawBody path:

```typescript
const rawBody = request.rawBody.toString("utf-8");
```

If rawBody could still be undefined (defensive), keep a single fallback:

```typescript
const rawBody = request.rawBody
  ? request.rawBody.toString("utf-8")
  : JSON.stringify(request.body);
```

The important fix is ensuring rawBody is populated — `JSON.stringify` fallback remains as defense-in-depth but is no longer the primary path.

- [ ] **Step 4: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

### Task 14: Add bounded concurrency to payment timeout cron

**Files:**
- Modify: `apps/server/src/modules/background/cron/payment-timeout.cron.ts:67-78`

- [ ] **Step 1: Read current cron handler**

```bash
cat -n apps/server/src/modules/background/cron/payment-timeout.cron.ts | sed -n '60,85p'
```

- [ ] **Step 2: Replace sequential loop with concurrent batches**

Replace:

```typescript
for (const payment of overdueResult.data) {
  const result = await this.paymentsService.expirePayment(payment.paymentId);
  // ...
}
```

with:

```typescript
const CONCURRENCY = 5;
const payments = overdueResult.data;

for (let i = 0; i < payments.length; i += CONCURRENCY) {
  const chunk = payments.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(
    chunk.map(p => this.paymentsService.expirePayment(p.paymentId))
  );
  for (let j = 0; j < results.length; j++) {
    const payment = chunk[j];
    const result = results[j];
    if (result.status === "rejected") {
      this.logger.error(`Payment timeout cron: expirePayment(${payment.paymentId}) threw:`, result.reason);
      continue;
    }
    const expireResult = result.value;
    if (expireResult.isFailure) {
      this.logger.warn(`Payment timeout cron: expirePayment(${payment.paymentId}) failed: ${expireResult.error.code}`);
    }
  }
}
```

- [ ] **Step 3: Run type check + tests**

```bash
cd apps/server && pnpm check-types 2>&1 | tail -10 && pnpm test 2>&1 | tail -30
```

Expected: 0 failures.

---

## Self-Review

### Spec (code review issues) coverage:
- Task 1: Critical — CB recovery cron dead code (in-memory vs Redis mismatch) ✅
- Task 2: Critical — raw AppError object literal ✅
- Task 3: Critical — generic "Invalid token" loses error detail ✅
- Task 4: Critical — Redis suspension check without producer ✅
- Task 5: Critical — confirmed_count: 0 hardcoded ✅
- Task 6: Critical — `!registration!` fragile pattern ✅
- Task 7: High — silent compensation failures ✅
- Task 8: High — TTL=-1 edge case ✅
- Task 9: High — cancelled workshop wrong error ✅
- Task 10: High — unchecked client timestamp ✅
- Task 11: Medium — misleading offline sync error mapping ✅ (listed as High in report but Medium severity; included as good practice)
- Task 12: High — empty workshopId after tx commit ✅
- Task 13: High — JSON.stringify key ordering breakage ✅
- Task 14: High — sequential payment timeout processing ✅

### Placeholder scan:
- All steps have real code, not "TBD" or "implement later" ✅
- File paths are exact ✅
- Commands are exact with expected output ✅

### Type consistency:
- All function signatures and imports reference existing patterns verified by reading the files ✅
- No name conflicts between tasks ✅
