## Context

The IAM module (`apps/server/src/modules/iam/`) is the security entry point for the entire system. It sits at the first stage of the request lifecycle (Inbound Security) and provides authentication, authorization, token lifecycle management, and user administration. All other modules depend on it.

**Current state**: The module structure, DTO schemas (6 Zod schemas), database schema (`users`, `students`), and core guards (`JwtAuthGuard`, `RolesGuard`, `WorkshopScopeGuard`) are complete and functional. However, all service methods, repository methods, and DTO builders are stubs (18 files with TODO bodies). The module is not yet registered in `AppModule`.

**Constraints**:
- Must follow the Result pattern — services never throw, always return `Result<T, AppError>`
- Must use Drizzle ORM via repositories, never raw SQL in services
- Token blacklist uses Redis with key pattern `token:blacklist:{jti}`
- JWT payload contract is defined in `src/types/jwt-payload.ts`
- Must align with naming conventions (kebab-case files, PascalCase classes, CQS functions)

## Goals / Non-Goals

**Goals:**
- Implement complete token lifecycle: sign, verify, blacklist, refresh with rotation
- Implement login flow with bcrypt credential validation and platform-aware token issuance
- Implement admin user management: list, detail, status update with auto-revocation on SUSPEND
- Implement check-in staff workshop assignment with eventual consistency warning
- Add `checkin_staff_assignments` table and migration
- Register IamModule in AppModule

**Non-Goals:**
- Password reset / forgot password flow (not in spec)
- Email verification for PENDING_VERIFICATION status (hook exists but logic deferred)
- Token usage tracking / analytics
- Changing the JWT payload contract or guard behavior

## Decisions

### D1: Use `jsonwebtoken` directly instead of `@nestjs/jwt`

**Rationale**: `JwtAuthGuard` already imports and uses `jsonwebtoken` (`jwt.verify()`). Using the same library in `TokenService` ensures consistent token format, avoids dual dependencies, and shares the same `JWT_SECRET`. No module registration needed — `TokenService` can `jwt.sign()` and `jwt.verify()` directly.

**Alternatives considered**: `@nestjs/jwt` would provide NestJS-managed module configuration but adds a wrapper layer with no value since we manage keys via env vars already.

### D2: Separate JWT secrets for Access and Refresh tokens

**Rationale**: Access tokens use `JWT_SECRET`. Refresh tokens use `JWT_REFRESH_SECRET`. This prevents a leaked access token secret from being used to forge refresh tokens. Both env vars are already expected by the architecture.

### D3: Refresh Token Rotation

**Rationale**: When a refresh token is used, the old refresh token is blacklisted in Redis and a new one is issued. This limits the window of a stolen refresh token to at most one use, after which the legitimate user's next refresh will fail (the stolen token was already used), triggering a force-logout.

### D4: User status check on login, not on every request

**Rationale**: The `JwtAuthGuard` does not query the database — it only verifies JWT validity and checks the Redis blacklist. Checking user status on every request would add a DB query to every API call. Instead, `AuthService.login()` validates `user.status === 'ACTIVE'` and returns `USER_SUSPENDED` if not. If an admin suspends a user, their existing tokens remain valid until the admin explicitly revokes them via the revoke endpoint. This is consistent with the spec's two-layer approach: status change prevents new logins, token revocation prevents active sessions.

**Trade-off**: A suspended user can continue using existing tokens until they're explicitly revoked. This is acceptable because the admin UI provides a dedicated "Revoke Tokens" button (FR-F01-008).

### D5: `checkin_staff_assignments` as single-row JSONB per user

**Rationale**: Each check-in staff member has one set of assigned workshop IDs. Storing as `{user_id, workshop_ids: string[]}` (JSONB) allows simple upsert logic. A junction table would require delete-all + re-insert on every assignment update.

**Schema**:
```sql
CREATE TABLE checkin_staff_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(user_id),
  workshop_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### D6: Login returns generic error for both wrong email and wrong password

**Rationale**: Per BR "Không tiết lộ email hay password cái nào sai (chống enumeration)", the login flow always returns `INVALID_CREDENTIALS` regardless of which field is wrong, and for suspended accounts. The user status check (`USER_SUSPENDED`) is also suppressed to prevent enumeration. Only active users with correct credentials receive tokens.

**Trade-off**: Legitimate users can't distinguish "wrong password" from "account doesn't exist." This is an intentional security measure, not a UX defect.

### D7: idempotency for logout

**Rationale**: Logout should be idempotent — calling it multiple times with the same or already-blacklisted token should succeed silently (200 OK). The blacklist operation uses `SET ... EX` which is inherently idempotent.

## Risks / Trade-offs

- **[No token tracking table]** → On SUSPEND, we can only revoke the user's *current* token (the one used for the revoke request). Other active tokens remain valid until they expire naturally. Mitigation: The admin UI provides a batch revoke option. Future enhancement: add a `user_sessions` table.
- **[Refresh token rotation]** → If a client loses the new refresh token after rotation (e.g., network failure between server response and client storage), the old token is already blacklisted. The user must log in again. This is acceptable — better than a stolen token being usable.
- **[Eventual consistency for assignments]** → Staff assignments take effect on next login only (JWT is immutable). Organizer UI must show a clear warning. This is by design per BR-041.

## Open Questions

- None. All design decisions are resolved by the existing specs (SRS FR-F01-001 through FR-F01-008, FR-F10-004) and the blueprint auth design doc.
