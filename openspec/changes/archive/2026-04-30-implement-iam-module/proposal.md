## Why

The IAM module is the security foundation of the entire system — every API request flows through its authentication and authorization pipeline. The core guards (`JwtAuthGuard`, `RolesGuard`, `WorkshopScopeGuard`), database schema (`users`, `students`), and DTO schemas are already in place, but the entire service layer, repository layer, and DTO builders are stubs. Without completing this module, no user can log in, no guard can validate tokens, and no other module can function.

## What Changes

- Implement `TokenService` with JWT sign/verify, Redis blacklist management, and platform-specific expiry (15min Web / 8hr Mobile)
- Implement `AuthService` with bcrypt login, token refresh with rotation, logout blacklist, and role-aware `getMe`
- Implement `UsersService` with admin user listing, detail, status update (with auto-token-revocation on SUSPEND)
- Implement `StudentProfileService` to resolve student profile for auth/me response composition
- Implement `CheckinStaffAssignmentService` with workshop assignment upsert and query, including eventual consistency warning
- Implement all repository methods: `UsersRepository`, `StudentsRepository`, `CheckinStaffAssignmentsRepository`
- Complete DTO response builders: `LoginResponseBuilder`, `AuthMeResponseBuilder`, `UserResponseBuilder`
- Wire controllers to injected services with proper types (remove `any` placeholders)
- Add `checkin_staff_assignments` table to database schema and generate migration
- Register `IamModule` in `AppModule`

## Capabilities

### New Capabilities

- `token-lifecycle`: JWT access/refresh token generation, verification, and Redis-based blacklist management with platform-specific expiry policies
- `user-authentication`: Login with bcrypt credential validation, silent token refresh with rotation, logout with token revocation, and role-aware current-user retrieval
- `user-management`: Admin operations for listing users, viewing user details, updating user status (with automatic token revocation on SUSPEND), and manual token revocation
- `staff-assignment`: Organizer-managed workshop assignments for check-in staff with upsert persistence and eventual consistency semantics

### Modified Capabilities

- `auth-guards`: JwtAuthGuard, RolesGuard, and WorkshopScopeGuard already exist and are complete — no spec changes needed. Their behavior is verified against the token lifecycle once TokenService is implemented.

## Impact

- **Database**: New `checkin_staff_assignments` table, migration file
- **AppModule**: Register `IamModule` in imports
- **IamModule**: All controllers, services, repositories become functional (18 stubs)
- **Dependencies**: `@nestjs/jwt`, `bcrypt`, `jsonwebtoken` (verify existing), `@types/bcrypt` (dev)
- **No breaking changes**: All external interfaces remain the same; only internal implementation is completed
- **Downstream**: Enables catalog, booking, and checkin modules to rely on working auth pipeline
