## Why

The Inbound Security Layer — the four Guards (`JwtAuthGuard`, `RolesGuard`, `WorkshopScopeGuard`, `HmacSignatureGuard`) — are the absolute gatekeepers of every API request. They enforce the Dual-Token JWT strategy, RBAC permissions, check-in scope boundaries, and payment webhook integrity defined in the access control blueprint. Currently all four guards have complete scaffold structure but their `canActivate` methods are TODO stubs that always return `true`, meaning zero authentication or authorization is actually enforced. Combined with the already-functional decorators (`@Public`, `@Roles`, `@CurrentUser`, `@IdempotencyKey`), implementing these guards completes the full 5-stage request lifecycle's first stage and enables Controllers to safely trust `request.user`.

## What Changes

- Implement `JwtAuthGuard.canActivate()` — extract Bearer token, delegate verification to `TokenService`, check Redis blacklist via `TokenService.isBlacklisted()`, attach `JwtPayload` to `request.user`
- Implement `RolesGuard.canActivate()` — read `@Roles()` metadata, compare with `request.user.role`, deny with 403 on mismatch
- Implement `WorkshopScopeGuard.canActivate()` — extract `workshop_id` from route params or body, validate against `allowed_workshop_ids` in JWT payload
- Implement `HmacSignatureGuard.canActivate()` — extract gateway from route params, compute HMAC-SHA256 with gateway-specific secret, compare against `X-Gateway-Signature` header
- Define `JwtPayload` interface with `sub`, `role`, `jti`, `allowed_workshop_ids` fields
- Update decorator JSDoc to English (implementation is already complete — these are pure NestJS `SetMetadata`/`createParamDecorator` patterns)

## Capabilities

### New Capabilities

- `auth-guards`: Inbound security enforcement — JWT authentication with blacklist checking, RBAC role authorization, check-in workshop-scope validation, and HMAC webhook signature verification. Defines the `JwtPayload` contract shared across all security components.

### Modified Capabilities

None — existing spec-level behaviors remain unchanged.

## Impact

- **`src/core/guards/jwt-auth.guard.ts`** — replace TODO with real JWT verification via `TokenService`
- **`src/core/guards/roles.guard.ts`** — replace TODO with role-matching logic against `@Roles()` metadata
- **`src/core/guards/workshop-scope.guard.ts`** — replace TODO with scope-validation against `allowed_workshop_ids`
- **`src/core/guards/hmac-signature.guard.ts`** — replace TODO with HMAC-SHA256 calculation and comparison
- **`src/shared/decorators/`** — update JSDoc comments to English (no logic changes — decorators are complete)
- **`src/shared/` or `src/core/`** — new `JwtPayload` interface definition
- **`TokenService`** (IAM module) — consumed by `JwtAuthGuard` for `verifyAccessToken()` and `isBlacklisted()`; guard implementation delegates to these methods without implementing them
