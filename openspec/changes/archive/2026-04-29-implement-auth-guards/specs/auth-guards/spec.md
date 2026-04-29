## ADDED Requirements

### Requirement: JwtAuthGuard validates Bearer tokens and checks blacklist

The system SHALL extract the JWT from the `Authorization: Bearer <token>` header, delegate signature and expiration verification to `TokenService.verifyAccessToken()`, check the token's `jti` against the Redis blacklist via `TokenService.isBlacklisted()`, and attach the decoded `JwtPayload` to `request.user`. If the route is decorated with `@Public()`, the guard MUST skip all authentication checks and allow the request through.

#### Scenario: Valid token passes authentication

- **WHEN** a request arrives with a valid, non-expired, non-blacklisted Bearer token
- **THEN** `JwtAuthGuard` attaches the decoded `JwtPayload` to `request.user` and returns `true`

#### Scenario: Missing token returns 401

- **WHEN** a request arrives without an `Authorization` header
- **THEN** `JwtAuthGuard` throws `UnauthorizedException` with message "Missing authorization token"

#### Scenario: Malformed token returns 401

- **WHEN** a request arrives with an `Authorization` header that does not start with `Bearer `
- **THEN** `JwtAuthGuard` throws `UnauthorizedException` with message "Missing authorization token"

#### Scenario: Invalid token returns 401

- **WHEN** `TokenService.verifyAccessToken()` throws or returns an invalid result
- **THEN** `JwtAuthGuard` throws `UnauthorizedException` with message "Invalid token"

#### Scenario: Blacklisted token returns 401

- **WHEN** `TokenService.isBlacklisted(jti)` returns `true` for a structurally valid token
- **THEN** `JwtAuthGuard` throws `UnauthorizedException` with message "Token has been revoked"

#### Scenario: Public route skips authentication

- **WHEN** a request targets a route decorated with `@Public()`
- **THEN** `JwtAuthGuard` returns `true` without inspecting the token or calling `TokenService`

### Requirement: RolesGuard enforces RBAC role requirements

The system SHALL read the `roles` metadata set by the `@Roles()` decorator on the target route handler, compare it against the `role` field in `request.user` (attached by `JwtAuthGuard`), and deny access with 403 if the user's role is not in the required list. If no `@Roles()` metadata is present, the guard MUST allow the request.

#### Scenario: User role matches required role

- **WHEN** `@Roles("STUDENT")` is set on the handler and `request.user.role` is `"STUDENT"`
- **THEN** `RolesGuard` returns `true`

#### Scenario: User role does not match

- **WHEN** `@Roles("ORGANIZER")` is set on the handler and `request.user.role` is `"STUDENT"`
- **THEN** `RolesGuard` throws `ForbiddenException` with message "Insufficient permissions"

#### Scenario: Multiple allowed roles include user's role

- **WHEN** `@Roles("ORGANIZER", "CHECKIN_STAFF")` is set and `request.user.role` is `"CHECKIN_STAFF"`
- **THEN** `RolesGuard` returns `true`

#### Scenario: No role metadata on handler

- **WHEN** a route has no `@Roles()` decorator
- **THEN** `RolesGuard` returns `true` without inspecting `request.user.role`

### Requirement: WorkshopScopeGuard validates check-in staff workshop assignments

The system SHALL extract the `workshop_id` from route parameters (`request.params.id`) or the request body (`request.body.workshop_id`), compare it against the `allowed_workshop_ids` array in `request.user` (from the JWT payload), and deny access with 403 if the workshop is not in the allowed list.

#### Scenario: Workshop is in allowed list (from route param)

- **WHEN** `workshop_id` is extracted from `request.params.id` and it exists in `request.user.allowed_workshop_ids`
- **THEN** `WorkshopScopeGuard` returns `true`

#### Scenario: Workshop is in allowed list (from request body)

- **WHEN** no `id` param exists but `request.body.workshop_id` is in `request.user.allowed_workshop_ids`
- **THEN** `WorkshopScopeGuard` returns `true`

#### Scenario: Workshop not in allowed list

- **WHEN** the extracted `workshop_id` is not in `request.user.allowed_workshop_ids`
- **THEN** `WorkshopScopeGuard` throws `ForbiddenException` with a message indicating the staff is not authorized for that workshop

#### Scenario: No workshop_id found in request

- **WHEN** neither `request.params.id` nor `request.body.workshop_id` contains a value
- **THEN** `WorkshopScopeGuard` throws `ForbiddenException` with message "Workshop identifier is required"

### Requirement: HmacSignatureGuard verifies payment webhook authenticity

The system SHALL extract the gateway name from `request.params.gateway`, look up the corresponding shared secret, compute the HMAC-SHA256 digest of the raw request body, and compare it (using a timing-safe comparison) against the `X-Gateway-Signature` header. If the signatures do not match, the guard MUST deny access with 401.

#### Scenario: Valid signature

- **WHEN** the computed HMAC-SHA256 matches the `X-Gateway-Signature` header value using a timing-safe comparison
- **THEN** `HmacSignatureGuard` returns `true`

#### Scenario: Missing signature header

- **WHEN** the `X-Gateway-Signature` header is absent from the request
- **THEN** `HmacSignatureGuard` throws `UnauthorizedException` with message "Missing signature header"

#### Scenario: Invalid signature

- **WHEN** the computed HMAC-SHA256 does not match the `X-Gateway-Signature` header
- **THEN** `HmacSignatureGuard` throws `UnauthorizedException` with message "Invalid signature"

#### Scenario: Unknown gateway

- **WHEN** `request.params.gateway` does not match any configured gateway secret
- **THEN** `HmacSignatureGuard` throws `UnauthorizedException` with message "Unknown payment gateway"

### Requirement: JwtPayload type defines the shared authentication contract

The system SHALL define a `JwtPayload` interface containing `sub` (user ID as string), `role` (UserRole), `jti` (unique token identifier as string), and `allowed_workshop_ids` (array of workshop ID strings, empty for non-staff roles). This type MUST be importable from a shared location accessible to both `core/` and `modules/`.

#### Scenario: Student JWT payload

- **WHEN** a `STUDENT` authenticates
- **THEN** the `JwtPayload` contains their user ID as `sub`, `role` set to `"STUDENT"`, a unique `jti`, and an empty `allowed_workshop_ids` array

#### Scenario: Check-in staff JWT payload

- **WHEN** a `CHECKIN_STAFF` authenticates
- **THEN** the `JwtPayload` contains their user ID as `sub`, `role` set to `"CHECKIN_STAFF"`, a unique `jti`, and an `allowed_workshop_ids` array listing their assigned workshop IDs
