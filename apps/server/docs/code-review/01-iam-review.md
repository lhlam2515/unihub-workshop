# IAM Module Code Review

**Scope:** apps/server/src/modules/iam/ + apps/server/src/core/guards/
**Date:** 2026-05-02
**Files Reviewed:** 21 (7 controllers/guards, 5 services, 3 repos, 6 DTOs)

---

## 1. NestJS Compliance

### 1.1 Overview & Fundamentals

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| N1.1 | **`@Res({ passthrough: true })` used in AuthController** — Project anti-pattern explicitly forbids `@Res()`. Couples controller to Express `Response` object. Forces manual cookie setting and response body mutation (`refresh_token: undefined`) outside the interceptor pipeline. | `auth.controller.ts:58, 99` | **HIGH** | Replace with a `@SetCookie()` decorator or move cookie logic into the ResponseInterceptor. NestJS passthrough `@Res()` still breaks the interceptor abstraction and makes unit testing harder (requires mocking `Response`). |
| N1.2 | **DTOs use raw type aliases instead of `createZodDto`** — All 4 request DTOs define Zod schemas but export `z.infer<>` type aliases instead of `extends createZodDto(Schema)` classes. Controllers must manually call `Schema.parse(dto)`, bypassing the global `ZodValidationPipe`. Validation errors thrown inside controllers may not be properly formatted by the exception filter. | `login.dto.ts:14`, `refresh-token.dto.ts:14`, `assign-workshops.dto.ts:14`, `update-user-status.dto.ts:14`; usage at `auth.controller.ts:60,101`, `checkin-staff-admin.controller.ts:37`, `users-admin.controller.ts:74` | **HIGH** | Convert all type aliases to `class XxxDto extends createZodDto(Schema) {}`. Remove manual `Schema.parse()` calls from controllers — let the `ZodValidationPipe` handle validation. This aligns with the project's established contract. |
| N1.3 | **Empty string passed for undefined refresh token** — When `refresh_token` is `undefined` (WEB platform, cookie-based), line 103 passes `""` to `authService.refreshToken()`. This propagates to `jwt.verify("", ...)` which always throws, returning a generic failure instead of a clear validation message. | `auth.controller.ts:103` | **MEDIUM** | Reject missing refresh tokens at the controller level with a specific error message. Use a Zod refine/check or early return. |
| N1.4 | **`iam.module.ts` — blank line missing before `@Module`** | `iam.module.ts:26-27` | **LOW** | Add blank line between declarations and `@Module` decorator for readability. |

### 1.2 Techniques

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| N2.1 | **HmacSignatureGuard loads secrets at module scope** — `GATEWAY_SECRETS` is evaluated once at require time. Cannot be refreshed without process restart. Though acceptable for env-var-based config, the module-level side effect is an anti-pattern for test isolation. | `hmac-signature.guard.ts:49-59` | **LOW** | Consider lazy-loading inside `canActivate()` or injecting a config service. |
| N2.2 | **WorkshopScopeGuard uses loose `||` fallback for workshop_id** — Prefers `params.id` over `body.workshop_id` with `||`. Empty string `""` would silently fall through. No UUID format validation on the extracted ID. | `workshop-scope.guard.ts:51-55` | **LOW** | Use `??` instead of `||` for more predictable fallback. Add a check that the extracted ID is a non-empty string. |

### 1.3 Security

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| N3.1 | **WEB refresh token cookie never read by controller** — The `POST /auth/refresh` endpoint sets the HttpOnly cookie (`REFRESH_COOKIE_OPTIONS.path = "/api/auth/refresh"`) but never reads `request.headers.cookie`. On the WEB platform, `parsed.refresh_token` is `undefined`, which falls through to `""`, causing every WEB refresh attempt to fail silently with `REFRESH_TOKEN_INVALID`. The cookie is write-only — the refresh flow is broken for WEB clients unless they redundantly send the token in the body. | `auth.controller.ts:97-104` vs `auth.controller.ts:68-72` (cookie set) | **CRITICAL** | Add cookie extraction: read `refreshToken` from `request.headers.cookie` as a fallback when `refresh_token` is not in the body. The service layer should receive the actual token, not `""`. |
| N3.2 | **`HmacSignatureGuard` uses `JSON.stringify(request.body)` for signature computation** — After Express body parsers have processed the payload, `JSON.stringify()` can produce different output than the original raw body (key ordering, whitespace, number encoding differences). Payment gateways sign the raw HTTP body, so re-serializing the parsed object invalidates the HMAC. | `hmac-signature.guard.ts:95-98` | **HIGH** | Use `request.rawBody` (requires `express.raw()` or `body-parser` raw body retention middleware). Most NestJS setups keep the raw body in `req.rawBody` or `req.body` (if using raw parser). |
| N3.3 | **`UsersService.revokeUserTokens` is a no-op** — Method claims to "revoke all active tokens" but only checks user existence and returns a confirmation message. No actual token blacklisting, status change, or session invalidation occurs. The `userId` parameter is unused for any revocation action. Method is effectively a placeholder stub. | `users.service.ts:116-131` | **CRITICAL** | Implement actual revocation: either blacklist the user's current `jti` (if available), set a `tokenVersion` field on the user record to invalidate all JWTs, or at minimum mark the account for forced re-authentication. If the operation is truly not implementable, rename to `checkUserExists()` or remove. |

---

## 2. Code Quality Principles

### 2.1 KISS

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ1.1 | **`AuthService.login` is 52 lines** — Just over the 50-line threshold. Contains CHECKIN_STAFF assignment loading inline (lines 59-67) that is duplicated elsewhere. | `auth.service.ts:41-93` | **MEDIUM** | Extract `loadStaffAssignments(userId)` private helper. |
| CQ1.2 | **`AuthService.getMe` is 49 lines** — Right at the threshold. Role-specific field assembly (lines 214-231) is verbose inline logic. | `auth.service.ts:195-244` | **LOW** | Consider extracting role-specific profile loading into a private method. |
| CQ1.3 | **`UsersService.revokeUserTokens` is a stub** — The method's body (15 lines) is entirely guard/check boilerplate returning a hardcoded message. No actual revocation logic. | `users.service.ts:116-131` | **CRITICAL** | See N3.3 — implement or remove. |

### 2.2 YAGNI

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ2.1 | **`TokenService.isBlacklisted()` is never called** — The `JwtAuthGuard` reads Redis directly via `redisService.get()`. The service method has no consumers within the scope. | `token.service.ts:138-141` | **MEDIUM** | Either refactor `JwtAuthGuard` to use `TokenService.isBlacklisted()` (preferred — keeps Redis logic in one place) or remove the unused method. |
| CQ2.2 | **`UsersRepository.create()` is never called** — No service in the IAM module calls `create()`. The method is not exported for cross-module use (IamModule only exports services). Dead code unless consumed by an external module, which would violate the cross-module repository access rule. | `users.repository.ts:68-79` | **MEDIUM** | Remove if unused. Add only when a user-creation feature is implemented. |
| CQ2.3 | **`StudentsRepository.findByStudentCode()` is never called** — JSDoc says "Used during CSV-based student data synchronization" but this flow may not be implemented yet. | `students.repository.ts:50-62` | **LOW** | Either remove until the CSV sync feature is built, or keep (minimal cost, implements a known future need). |

### 2.3 DRY

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ3.1 | **CHECKIN_STAFF workshop assignment loading duplicated 3×** — The same 9-line pattern (`if role === CHECKIN_STAFF → assignmentsRepo.findByUserId → extract workshopIds`) appears identically in `login` (lines 59-67), `refreshToken` (lines 132-140), and `getMe` (lines 226-231). | `auth.service.ts:59-67, 132-140, 226-231` | **MEDIUM** | Extract a private `private async loadStaffWorkshops(userId: string): Promise<string[] | undefined>` helper. |
| CQ3.2 | **Inline error object literals used instead of error factories** — 7 instances of raw `Result.fail({ category, code, message })` with hardcoded strings. Should use the project's shared error factory functions (e.g., `authErrors`, `systemErrors`). | `auth.service.ts:201-205`, `checkin-staff-assignment.service.ts:40-44, 49-53`, `users.service.ts:58-62, 93-97, 120-124` | **HIGH** | Use `authErrors.userNotFound()` or create a new factory in `errors.ts`. Inline literals bypass the centralized error catalog, making error codes harder to audit and inconsistent across the module. |
| CQ3.3 | **Platform-expiry constant duplicated** — `accessTokenExpiry` mapping in `auth.service.ts:78` (`const expiresIn = platform === "WEB" ? 900 : 28800`) duplicates the `ACCESS_EXPIRY` constant already defined in `token.service.ts:11`. | `auth.service.ts:78` vs `token.service.ts:11` | **MEDIUM** | Reference `ACCESS_EXPIRY[platform]` from TokenService instead of hardcoding the values again. |

### 2.4 SOLID

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ4.1 | **SRP: `AuthService` has 4 constructor dependencies** — Orchestrates user lookup, token signing, student profile, and staff assignments. Acceptable for a central auth service but approaching the threshold where it should be split. | `auth.service.ts:16-21` | **MEDIUM** | Consider splitting auth orchestration into focused sub-services (e.g., `LoginOrchestrator`, `TokenRefreshOrchestrator`) if dependencies grow further. |
| CQ4.2 | **DIP: `TokenService` returns `Promise<Result<...>>` but `signAccessToken` / `signRefreshToken` return bare `Promise<string>`** — Inconsistent. Callers must handle errors via try/catch for signing but via `Result` for verification. | `token.service.ts:35-56, 68-75` | **MEDIUM** | Wrap `jwt.sign` calls in `tryCatch` so signing also returns `Result<string>` consistently. Currently a `jwt.sign` failure would throw instead of returning a FailResult. |

### 2.5 Separation of Concerns

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ5.1 | **AuthController handles cookie logic and response body transformation** — The controller strips `refresh_token` from the response body and sets HttpOnly cookies. This violates the thin-controller principle and the "return Result directly" anti-pattern rule. | `auth.controller.ts:67-73, 106-112` | **HIGH** | See N1.1. Extract cookie handling into a reusable decorator or interceptor. |
| CQ5.2 | **Controllers manually validate with `Schema.parse()`** — Validation logic lives in controllers instead of being delegated to the `ZodValidationPipe`. Controllers should focus on HTTP routing, not validation orchestration. | `auth.controller.ts:60, 101`, `checkin-staff-admin.controller.ts:37`, `users-admin.controller.ts:74` | **MEDIUM** | See N1.2. Use `createZodDto` classes and let the global pipe handle validation. |

### 2.6 Law of Demeter

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| CQ6.1 | **`userResult.data.status`** — 2 levels of chaining throughout. Acceptable within the Result pattern. | Multiple | **LOW** | No action needed. The Result pattern naturally limits to 2 levels. |
| CQ6.2 | **`assignmentResult.data.workshopIds`** — Same pattern. | Multiple | **LOW** | No action needed. |

---

## 3. Strategic Recommendations

### 3.1 Immediate Fixes (Critical)

1. **Fix WEB refresh token flow (N3.1):** The `POST /auth/refresh` endpoint never reads the HttpOnly cookie. Add cookie extraction: `request.cookies?.refreshToken` as fallback when body's `refresh_token` is empty. Without this fix, every WEB client refresh attempt fails.

2. **Implement or remove `revokeUserTokens` (N3.3/CQ1.3):** The method is a no-op stub in production code. Either implement actual token revocation (blacklist current tokens, set `tokenVersion` on user, or force re-auth) or remove the endpoint entirely. A no-op endpoint with a misleading name is a security risk — administrators who call it believe tokens are revoked when they are not.

3. **Audit `HmacSignatureGuard` raw body handling (N3.2):** Switch from `JSON.stringify(request.body)` to `request.rawBody` with a raw body parser middleware. Payment gateway webhooks will silently fail signature verification with the current approach.

### 3.2 Short-Term Improvements (High)

1. **Adopt `createZodDto` pattern (N1.2):** Convert all 4 request DTOs to `extends createZodDto(Schema)`. Remove manual `Schema.parse()` from controllers. This brings the IAM module in line with the rest of the codebase and enables the global `ZodValidationPipe`.

2. **Move cookie handling out of controllers (N1.1/CQ5.1):** Create a `@SetRefreshCookie()` decorator or a `RefreshCookieInterceptor` to handle HttpOnly cookie setting. This restores the thin-controller pattern and eliminates the `@Res()` dependency.

3. **Use error factories for all errors (CQ3.2):** Add the missing error codes (`USER_NOT_FOUND`, `VALIDATION_FAILED`) to the shared error factory (`authErrors`, etc.) and replace all 7 inline error literal instances.

### 3.3 Long-Term Architecture

1. **Extract `loadStaffWorkshops()` helper (CQ3.1/CQ4.1):** The CHECKIN_STAFF workshop loading logic appears in 3 places. Extract into a reusable private method or a dedicated `StaffAssignmentProvider` service. This reduces duplication and makes the role-specific behavior testable in isolation.

2. **Align `jwt.sign` with Result pattern (CQ4.2):** Wrap `jwt.sign` calls in `tryCatch` so token signing returns `Result<string>` like the verification methods. Currently a JWT signing failure throws uncaught, potentially causing a 500 error.

3. **Refactor `JwtAuthGuard` to use `TokenService.isBlacklisted()` (CQ2.1):** Move Redis blacklist checking into the `TokenService` so all token lifecycle operations go through a single service. This prevents Redis key pattern leakage into the guard layer.

---

## Finding Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| NestJS Compliance (Pass 1) | 2 | 3 | 2 | 4 | 11 |
| Code Quality (Pass 1) | 1 | 2 | 6 | 4 | 13 |
| **Pass 1 Subtotal** | **3** | **5** | **8** | **8** | **24** |
| NestJS Compliance (Pass 2) | 1 | 0 | 1 | 2 | 4 |
| Code Quality (Pass 2) | 1 | 1 | 3 | 5 | 10 |
| **Pass 2 Subtotal** | **2** | **1** | **4** | **7** | **14** |
| **Combined Total** | **5** | **6** | **12** | **15** | **38** |

### Key Strengths

- **Strong Result pattern adherence:** All services return `Result<T>` — no exceptions thrown in business logic. Error propagation is clean and consistent.
- **Excellent JSDoc coverage:** Nearly every public method has contract-oriented documentation with business rules, side effects, and error codes.
- **Clean repository layer:** All repos use `tryCatch` with `systemErrors.internal()`, database connections are injected properly, and queries follow Drizzle patterns.
- **Proper guard chain:** `JwtAuthGuard` → `RolesGuard` → `WorkshopScopeGuard` provides clear separation of auth versus authorization concerns.
- **Refresh token rotation:** Properly blacklisting consumed refresh tokens in Redis demonstrates good security hygiene.
- **Module exports are minimal:** Only services are exported (`AuthService`, `TokenService`, `UsersService`), preventing unwanted cross-module repository access.

### Key Weaknesses

- **`createZodDto` not used:** The entire IAM module bypasses the project's validated input contract, doing manual `Schema.parse()` in controllers. This is the most significant architectural deviation.
- **No-op `revokeUserTokens`:** A security-sensitive method (token revocation) with zero actual implementation. Poses a real-world risk if administrators rely on it.
- **WEB refresh token flow is broken:** The HttpOnly cookie is set but never read on the refresh endpoint — WEB clients cannot refresh tokens without manually sending the token in the body.
- **`@Res()` in auth controller:** Explicitly forbidden by project anti-patterns. Couples to Express and breaks the interceptor pipeline.
- **Inline error objects instead of factories:** 7 instances of raw error literals bypassing the centralized error catalog.
- **Duplicated CHECKIN_STAFF assignment logic:** Same 9-line block in 3 separate methods of `AuthService`.

---

## Pass 2 Additions (NestJS Docs + Code Quality Specialist)

### Pass 2 — NestJS Compliance & Architecture

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| P2.1 | **`refreshToken()` hardcodes platform to `"WEB"` and `expiresIn` to `900`** — MOBILE clients refreshing receive a 15-minute (WEB) access token instead of 8-hour (MOBILE) expiry. The contract promised during login (platform-specific expiry) is silently broken on refresh. | `auth.service.ts:142-158` | **CRITICAL** | Pass the platform to `refreshToken()` (e.g., via header or a claim in the refresh token) and use `ACCESS_EXPIRY[platform]` instead of hardcoded 900. |
| P2.2 | **`logout()` does not invalidate the user's refresh token** — Only the access token's jti is blacklisted (900s TTL). The refresh token remains valid and can be used once (rotation) to obtain a new token pair. MOBILE clients that retain the refresh token can bypass logout. | `auth.service.ts:175-178` | **MEDIUM** | Blacklist the user's active refresh token jti on logout, or clear the HttpOnly cookie on WEB and document that MOBILE must discard the refresh token. |
| P2.3 | **`RolesGuard` uses magic string `"roles"` instead of typed `Reflector.createDecorator`** — NestJS 11 supports `Reflector.createDecorator<string[]>()` which eliminates the magic string and provides compile-time type safety. The current `SetMetadata("roles", ...)` / `reflector.getAllAndOverride<string[]>("roles", ...)` uses a bare string duplicated in `roles.decorator.ts` and `roles.guard.ts`. | `roles.guard.ts:51` | **LOW** | Migrate to `Reflector.createDecorator<string[]>()` in `roles.decorator.ts` and use `this.reflector.get(Roles, ...)` in the guard. |
| P2.4 | **`JwtAuthGuard` reads `process.env.JWT_SECRET!` directly instead of using a config service** — The guard bypasses `TokenService`'s `JWT_SECRET()` getter. If the secret configuration changes (e.g., moves to ConfigService), the guard and service must both be updated. | `jwt-auth.guard.ts:82` | **LOW** | Extract JWT secret resolution into a shared config utility in `src/shared/` that both the guard and `TokenService` use. |

### Pass 2 — Code Quality (KISS, YAGNI, DRY, SOLID, SoC, Law of Demeter)

| # | Finding | File:Line | Severity | Suggestion |
|---|---------|-----------|----------|------------|
| P2.5 | **`UsersService.updateUserStatus` blacklists the ADMIN's token instead of the target user's token** — The controller passes `admin.jti` to the service, which blacklists the administrator's own token when suspending a user. The suspended user's JWT remains valid. The suspension feature effectively locks out the admin who used it while the target user continues uninterrupted. | `users.service.ts:100-101` (caller: `users-admin.controller.ts:75`) | **CRITICAL** | Revoke the target user's tokens instead. Since the system does not track per-user jtis, either (a) set a `user:suspended:{userId}` Redis flag checked by `JwtAuthGuard`, or (b) implement user-to-jti tracking at token issuance. At minimum, do not blacklist the admin's own token. |
| P2.6 | **`JwtAuthGuard` duplicates JWT verification logic from `TokenService.verifyAccessToken`** — The guard calls `jwt.verify(token, process.env.JWT_SECRET!)` directly with generic error handling ("Invalid token" for both expired and malformed). `TokenService.verifyAccessToken` has identical logic with proper error distinction (`TokenExpiredError` vs `TokenInvalidError`). DRY violation in a security-critical path. | `jwt-auth.guard.ts:82` vs `token.service.ts:85-95` | **HIGH** | Extract JWT verification into a shared utility in `src/shared/` that respects layer boundaries. The guard should not duplicate crypto logic. |
| P2.7 | **`TokenService.signAccessToken` adds empty `allowed_workshop_ids: []` to every JWT, including STUDENT/ORGANIZER tokens** — Increases JWT payload size for all users. The downstream `WorkshopScopeGuard` already handles `undefined`. YAGNI. | `token.service.ts:50` | **MEDIUM** | Conditionally include `allowed_workshop_ids` only when it has meaningful values (CHECKIN_STAFF role with assignments). |
| P2.8 | **`CheckinStaffAssignmentService.getAssignedWorkshops` skips user validation, but `assignWorkshops` validates** — Passing a non-existent userId returns `{ user_id: "garbage", workshop_ids: [] }` with no error, masking caller bugs. Inconsistent behavior within the same service. | `checkin-staff-assignment.service.ts:74-84` | **LOW** | Add user existence validation in `getAssignedWorkshops` for consistency with `assignWorkshops`. |
| P2.9 | **`StudentProfileService` is a pass-through wrapper with zero business logic (YAGNI/KISS)** — The entire service delegates `getProfileByUserId` → `StudentsRepository.findByUserId` with no transformation, caching, or validation. `AuthService` (same module) could call the repository directly. | `student-profile.service.ts:21-23` | **LOW** | Either inline into `AuthService.getMe` or keep with JSDoc explaining what future business rule it is reserved for. |
| P2.10 | **`AuthService.refreshToken()` response uses camelCase (`accessToken`, `refreshToken`, `expiresIn`) while `login()` uses snake_case (`access_token`, `refresh_token`, `expires_in`) via `LoginResponseBuilder`** — Inconsistent API contract between related operations forces clients to handle both naming conventions. | `auth.service.ts:155-159` vs `login-response.dto.ts:39-45` | **MEDIUM** | Use `LoginResponseBuilder.from()` in `refreshToken()` (or a similar builder) to produce consistent snake_case responses. |
| P2.11 | **`TokenService` uses `Promise.resolve(jwt.sign(...))` — misleading async wrapper around synchronous code** — `jwt.sign()` without callback is synchronous. `Promise.resolve()` offers no error safety; if `jwt.sign()` throws, the exception propagates synchronously before the Promise is reached. | `token.service.ts:43-56, 68-75` | **LOW** | Either (a) change return type to `string` (synchronous) since signing is inherently synchronous, or (b) wrap with `tryCatch` for proper `Result.fail()` error handling. |
| P2.12 | **`AuthService.getMe` does unnecessary identity-mapping of student profile fields** — Field names are identical between source (`profileResult.data.studentCode`, `.fullName`, `.faculty`) and destination. When the `Student` type changes, this mapping must be updated even though it does nothing. | `auth.service.ts:214-223` | **LOW** | Pass `profileResult.data` directly as the `studentProfile` argument, or accept the raw `Student` type in the builder parameter. |
| P2.13 | **`UsersRepository.updateStatus` includes `PENDING_VERIFICATION` in the union type but no caller ever passes it** — Speculative future-proofing that adds unnecessary API surface. YAGNI. | `users.repository.ts:136` | **LOW** | Remove `PENDING_VERIFICATION` from the union type until a feature requires it. |
| P2.14 | **`WorkshopScopeGuard` is checkin-module-specific logic placed in `core/guards/`** — It understands `allowed_workshop_ids` JWT claims (IAM domain knowledge) and its JSDoc says "used in Check-in Module." Meanwhile `JwtAuthGuard` and `RolesGuard` are genuinely cross-cutting. Having module-specific guards in `core/` muddles SoC. | `workshop-scope.guard.ts:1-69` | **LOW** | Move `WorkshopScopeGuard` to `src/modules/checkin/guards/` or `src/modules/iam/guards/`. Reserve `core/guards/` for truly cross-cutting guards. |

### Summary Comparison

#### New Total Finding Summary (Original 24 + Pass 2 = 45)

| Category | Pass 1 Counts | Pass 2 Additions | **Combined Total** |
|----------|---------------|------------------|-------------------|
| **NestJS Compliance** | 11 (2C/3H/2M/4L) | 4 (1C/0H/1M/2L) | **15** |
| **Code Quality** | 13 (1C/2H/6M/4L) | 10 (1C/1H/3M/5L) | **23** |
| **Total** | **24 (3C/5H/8M/8L)** | **14 (2C/1H/4M/7L)** | **38 (5C/6H/12M/15L)** |

#### Pass 2 Summary Table

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| P2.1 | CRITICAL | NestJS | `refreshToken()` hardcodes WEB-only expiry, breaks MOBILE refresh flow |
| P2.5 | CRITICAL | Quality | `updateUserStatus` blacklists admin's token instead of target user's |
| P2.6 | HIGH | Quality | JWT verification duplicated across `JwtAuthGuard` and `TokenService` |
| P2.2 | MEDIUM | NestJS | `logout()` doesn't invalidate refresh token |
| P2.7 | MEDIUM | Quality | Empty `allowed_workshop_ids` in every JWT (YAGNI) |
| P2.10 | MEDIUM | Quality | `refreshToken()` returns camelCase vs `login()` returns snake_case |
| P2.3 | LOW | NestJS | RolesGuard uses magic string `"roles"` not typed decorator |
| P2.4 | LOW | NestJS | JwtAuthGuard reads `process.env.JWT_SECRET!` directly |
| P2.8 | LOW | Quality | `getAssignedWorkshops` skips user validation (inconsistent) |
| P2.9 | LOW | Quality | `StudentProfileService` pass-through wrapper (YAGNI/KISS) |
| P2.11 | LOW | Quality | `Promise.resolve(jwt.sign())` misleading async wrapper |
| P2.12 | LOW | Quality | Unnecessary identity-mapping of student profile fields |
| P2.13 | LOW | Quality | `PENDING_VERIFICATION` in union type, never passed (YAGNI) |
| P2.14 | LOW | Quality | `WorkshopScopeGuard` is module-specific but lives in `core/` |
