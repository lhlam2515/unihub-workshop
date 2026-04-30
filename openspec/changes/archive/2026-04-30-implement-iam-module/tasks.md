## 1. Database Schema

- [x] 1.1 Add `checkin_staff_assignments` table to `src/database/schema/identity.schema.ts`
- [x] 1.2 Add types for the new table in `src/database/types/identity.types.ts`
- [x] 1.3 Add `checkinStaffAssignmentsRelations` to `src/database/schema/relations.schema.ts`
- [x] 1.4 Generate migration with `pnpm db:generate`

## 2. Response DTO Builders

- [x] 2.1 Implement `UserResponseBuilder.from()` in `src/modules/iam/dto/user-response.dto.ts`
- [x] 2.2 Implement `AuthMeResponseBuilder.from()` in `src/modules/iam/dto/auth-me-response.dto.ts`
- [x] 2.3 Implement `LoginResponseBuilder.from()` in `src/modules/iam/dto/login-response.dto.ts`

## 3. Repositories

- [x] 3.1 Implement `UsersRepository` methods: `findById`, `findByEmail`, `create`, `updateStatus`, `list`
- [x] 3.2 Implement `StudentsRepository` methods: `findByUserId`, `findByStudentCode`
- [x] 3.3 Implement `CheckinStaffAssignmentsRepository` methods: `findByUserId`, `upsert`

## 4. Token Service

- [x] 4.1 Implement `signAccessToken(payload, platform)` with platform-specific expiry
- [x] 4.2 Implement `signRefreshToken(userId)` with 7-day expiry
- [x] 4.3 Implement `verifyAccessToken(token)` returning `Result<JwtPayload>`
- [x] 4.4 Implement `verifyRefreshToken(token)` returning `Result`
- [x] 4.5 Implement `blacklistToken(jti, remainingTtl)` using Redis
- [x] 4.6 Implement `isBlacklisted(jti)` checking Redis

## 5. Auth Service

- [x] 5.1 Implement `login(email, password, platform)` with bcrypt verify, status check, dual-token issuance
- [x] 5.2 Implement `refreshToken(refreshToken)` with rotation and old-token blacklist
- [x] 5.3 Implement `logout(userId, jti)` with idempotent blacklist
- [x] 5.4 Implement `getMe(userId)` with role-specific field resolution (student profile / staff assignments)

## 6. User Management

- [x] 6.1 Implement `UsersService.listUsers(role?, pagination?)` with Drizzle pagination
- [x] 6.2 Implement `UsersService.getUserById(id)` with not-found handling
- [x] 6.3 Implement `UsersService.updateUserStatus(id, status)` with auto-revoke on SUSPEND
- [x] 6.4 Implement `UsersService.revokeUserTokens(userId)` returning confirmation

## 7. Supporting Services

- [x] 7.1 Implement `StudentProfileService.getProfileByUserId(userId)` resolving student data
- [x] 7.2 Implement `CheckinStaffAssignmentService.assignWorkshops(userId, workshopIds)` with validation and eventual consistency warning
- [x] 7.3 Implement `CheckinStaffAssignmentService.getAssignedWorkshops(userId)` returning workshop list

## 8. Controllers

- [x] 8.1 Wire `AuthController` methods to `AuthService` with proper types and Zod DTOs
- [x] 8.2 Wire `UsersAdminController` methods to `UsersService` with proper types and Zod DTOs
- [x] 8.3 Wire `CheckinStaffAdminController` methods to `CheckinStaffAssignmentService` with proper types and Zod DTOs

## 9. Module Registration

- [x] 9.1 Register `IamModule` in `AppModule` imports
- [x] 9.2 Verify application builds without errors (`pnpm --filter=server build`)
- [x] 9.3 Verify migration was generated
