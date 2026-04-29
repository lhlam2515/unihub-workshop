## 1. Shared Types

- [x] 1.1 Define `JwtPayload` interface at `src/shared/types/jwt-payload.ts` with fields: `sub` (string), `role` (UserRole), `jti` (string), `allowed_workshop_ids` (string[])

## 2. JwtAuthGuard Implementation

- [x] 2.1 Inject `Reflector` and `RedisService` into `JwtAuthGuard` constructor (TokenService avoided — core/ cannot import from modules/ per ESLint boundary; JWT verification uses `jsonwebtoken` directly, blacklist check uses `RedisService`)
- [x] 2.2 Implement `canActivate()`: check `@Public()` via Reflector, extract Bearer token, verify JWT with `jwt.verify()`, check blacklist via `RedisService.get(token:blacklist:{jti})`, attach `JwtPayload` to `request.user`

## 3. RolesGuard Implementation

- [x] 3.1 Implement `canActivate()`: read `roles` metadata via Reflector from handler and class, compare `request.user.role` against required roles, throw `ForbiddenException` on mismatch

## 4. WorkshopScopeGuard Implementation

- [x] 4.1 Implement `canActivate()`: extract `workshop_id` from `request.params.id` or `request.body.workshop_id`, validate it exists in `request.user.allowed_workshop_ids`, throw `ForbiddenException` on mismatch or missing workshop_id

## 5. HmacSignatureGuard Implementation

- [x] 5.1 Define `PAYMENT_GATEWAY_SECRETS` map with gateway-specific HMAC secrets from environment variable
- [x] 5.2 Implement `canActivate()`: extract gateway from `request.params.gateway`, look up secret, compute HMAC-SHA256 over raw body, timing-safe compare against `X-Gateway-Signature` header

## 6. Decorator Documentation

- [x] 6.1 Update `public.decorator.ts` JSDoc to English
- [x] 6.2 Update `roles.decorator.ts` JSDoc to English
- [x] 6.3 Update `current-user.decorator.ts` JSDoc to English
- [x] 6.4 Update `idempotency-key.decorator.ts` JSDoc to English

## 7. Verification

- [x] 7.1 Verify `pnpm build --filter=server` succeeds with no TypeScript errors
- [x] 7.2 Verify all 4 guards are injectable and resolve their dependencies correctly
