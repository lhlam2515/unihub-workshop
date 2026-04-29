## Context

The four guards at `src/core/guards/` are scaffolds: their `canActivate()` methods contain TODO comments and unconditionally return `true`. Meanwhile, the four decorators at `src/shared/decorators/` are already fully implemented — they use standard NestJS `SetMetadata` and `createParamDecorator` patterns that work without modification. The `TokenService` in the IAM module is also a stub, but `JwtAuthGuard` must be coded against its public interface (`verifyAccessToken`, `isBlacklisted`) so the guard is correct and complete when `TokenService` is later implemented. This change implements the guard logic and defines the shared `JwtPayload` contract.

## Goals / Non-Goals

**Goals:**
- Implement all four guards with real authentication/authorization logic
- Define the `JwtPayload` interface as the contract between `TokenService`, guards, and `@CurrentUser()` decorator
- Update decorator JSDoc to English (no logic changes needed)
- Guards delegate JWT cryptography to `TokenService` — guards enforce policy, not crypto

**Non-Goals:**
- Implementing `TokenService` methods (separate change — guards call the existing interface)
- Configuring which routes use which guards (controller-level wiring is a separate change)
- Adding dynamic role resolution or permission-based access (RBAC role strings are sufficient)
- Implementing rate limiting in guards (that's the Mechanics layer's responsibility)

## Decisions

### 1. Guards throw NestJS exceptions directly, not `Result<T>`

**Choice:** Guards throw `UnauthorizedException` (401) and `ForbiddenException` (403) directly.

**Why:** NestJS guards run before the controller and return a boolean. If a guard throws, the `GlobalExceptionFilter` catches it and maps to the standard `ApiResponse` envelope. The Result pattern lives in the Service layer — guards are framework infrastructure, not business logic. This follows the layered architecture rule that `core/` (framework) is allowed to use NestJS primitives.

**Alternatives considered:**
- *Returning `Result.fail()` from guards*: Would break the `CanActivate` contract (returns `boolean | Promise<boolean>`) and couple guards to the business-layer error pattern unnecessarily.

### 2. JwtAuthGuard delegates to TokenService, does not verify JWTs itself

**Choice:** `JwtAuthGuard` injects `TokenService` and calls `verifyAccessToken(token)` and `isBlacklisted(jti)`. The guard does not import `jsonwebtoken` or touch `jwt.verify()` directly.

**Why:** Token lifecycle management (signing, verification, blacklisting) is the IAM module's bounded context. The guard enforces *when* verification happens (every request), not *how*. This keeps crypto logic centralized in one service for easier key rotation and algorithm changes.

### 3. JwtPayload interface lives in a shared types file

**Choice:** Define `JwtPayload` in a new file at `src/shared/types/jwt-payload.ts` (or similar shared location).

**Why:** `JwtPayload` is consumed by `core/guards/` (JwtAuthGuard, RolesGuard, WorkshopScopeGuard), `shared/decorators/` (CurrentUser), and `modules/iam/` (TokenService). Per the layered architecture, types shared across layers belong in `shared/`. The database `types/` directory infers types from Drizzle schemas — `JwtPayload` is not a DB type.

**Fields:** `sub` (user ID), `role` (UserRole), `jti` (JWT ID for blacklist), `allowed_workshop_ids` (string array, for CHECKIN_STAFF scope).

### 4. HMAC secrets configured via a static map, not database

**Choice:** Hardcode gateway secrets in a `PAYMENT_GATEWAY_SECRETS` map keyed by `PaymentGateway` enum value, read from environment variables at startup.

**Why:** Gateway secrets are deployment-level configuration, not runtime data. They change with the environment (staging vs production), not per request. A static lookup avoids a database round-trip on every webhook call. The secrets are loaded from `process.env` with a JSON-encoded map (e.g., `PAYMENT_GATEWAY_SECRETS={"vnpay":"sec1","momo":"sec2"}`).

**Alternatives considered:**
- *Database storage*: Adds latency to webhook verification and creates a circular dependency (need DB to verify webhooks, need webhooks to update DB state).

### 5. WorkshopScopeGuard extracts workshop_id from multiple sources

**Choice:** Check `request.params.id` first, then fall back to `request.body.workshop_id`.

**Why:** Check-in endpoints may receive the workshop ID in the URL (`POST /checkin/:id/scan`) or in the body (`{ workshop_id: "...", qr_token: "..." }`). The guard inspects both locations to support both patterns without requiring controller changes.

## Risks / Trade-offs

- **TokenService stub means guards compile but throw at runtime**: If `TokenService.verifyAccessToken()` is called before it's implemented, it returns `null` and the guard throws `TOKEN_INVALID` for every request. This is intentional — it fails closed rather than silently allowing all traffic. Mitigation: implement TokenService next.
- **HMAC secrets in env vars**: A large number of gateways could make the JSON env var unwieldy. Current scope (3-4 gateways) is manageable. Mitigation: migrate to a secrets manager (Vault, AWS Secrets Manager) if gateway count grows beyond ~10.
- **No token caching in guard**: Every request hits `TokenService.verifyAccessToken()` which will do a `jwt.verify()` call. This is ~1ms and acceptable per the blueprint's performance targets. Mitigation: add in-memory caching of verification results keyed by `jti` if profiling shows bottlenecks.
