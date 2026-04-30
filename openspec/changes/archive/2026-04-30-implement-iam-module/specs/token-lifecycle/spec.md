## ADDED Requirements

### Requirement: TokenService signs access tokens with platform-specific expiry

The system SHALL generate JWT access tokens signed with `JWT_SECRET` containing claims `sub` (user ID), `role` (UserRole), `jti` (UUID v4 unique token identifier), and `allowed_workshop_ids` (string array). For `WEB` platform, the token SHALL expire in 15 minutes. For `MOBILE` platform, the token SHALL expire in 8 hours.

#### Scenario: Web platform access token has 15-minute expiry

- **WHEN** TokenService signs an access token for platform `WEB` with user ID `user-1` and role `STUDENT`
- **THEN** the returned JWT contains `sub: "user-1"`, `role: "STUDENT"`, a UUID `jti`, `allowed_workshop_ids: []`, and `exp` is 15 minutes from now

#### Scenario: Mobile platform access token has 8-hour expiry

- **WHEN** TokenService signs an access token for platform `MOBILE` with user ID `user-2` and role `CHECKIN_STAFF`
- **THEN** the returned JWT contains `role: "CHECKIN_STAFF"` and `exp` is 8 hours from now

#### Scenario: Check-in staff token includes allowed workshop IDs

- **WHEN** TokenService signs an access token for a `CHECKIN_STAFF` user with assignments `["wid-A", "wid-B"]`
- **THEN** the token payload contains `allowed_workshop_ids: ["wid-A", "wid-B"]`

### Requirement: TokenService signs refresh tokens with 7-day expiry

The system SHALL generate JWT refresh tokens signed with `JWT_REFRESH_SECRET` containing claims `sub` (user ID) and `jti` (UUID v4 unique token identifier), expiring in 7 days.

#### Scenario: Refresh token issued with 7-day expiry

- **WHEN** TokenService signs a refresh token for user ID `user-1`
- **THEN** the returned JWT contains `sub: "user-1"`, a UUID `jti`, and `exp` is 7 days from now

### Requirement: TokenService verifies access tokens

The system SHALL verify an access token's JWT signature using `JWT_SECRET`, check expiration, and return the decoded `JwtPayload`. If the token is invalid, expired, or malformed, the service SHALL return a `FailResult` with `TOKEN_INVALID` or `TOKEN_EXPIRED` respectively.

#### Scenario: Valid access token verification succeeds

- **WHEN** TokenService verifies a valid, non-expired access token
- **THEN** the method returns `Result.ok(JwtPayload)` with the decoded claims

#### Scenario: Expired access token returns TOKEN_EXPIRED

- **WHEN** TokenService verifies an access token whose `exp` is in the past
- **THEN** the method returns `Result.fail(authErrors.tokenExpired())`

#### Scenario: Malformed token returns TOKEN_INVALID

- **WHEN** TokenService verifies a string that is not a valid JWT
- **THEN** the method returns `Result.fail(authErrors.tokenInvalid())`

### Requirement: TokenService verifies refresh tokens

The system SHALL verify a refresh token's JWT signature using `JWT_REFRESH_SECRET`, check expiration, and return the decoded payload. If the refresh token is invalid or expired, the service SHALL return a `FailResult` with `REFRESH_TOKEN_INVALID`.

#### Scenario: Valid refresh token verification succeeds

- **WHEN** TokenService verifies a valid, non-expired refresh token
- **THEN** the method returns `Result.ok()` with the decoded payload

#### Scenario: Expired refresh token returns REFRESH_TOKEN_INVALID

- **WHEN** TokenService verifies a refresh token whose `exp` is in the past
- **THEN** the method returns `Result.fail(authErrors.refreshTokenInvalid())`

### Requirement: TokenService manages token blacklist in Redis

The system SHALL blacklist a token by storing `"revoked"` at Redis key `token:blacklist:{jti}` with TTL equal to the remaining lifetime of the JWT. The system SHALL check blacklist status by querying `token:blacklist:{jti}` for existence.

#### Scenario: Blacklist token with remaining TTL

- **WHEN** TokenService blacklists a token with `jti = "abc-123"` and `remainingTtl = 600`
- **THEN** Redis key `token:blacklist:abc-123` is set to `"revoked"` with TTL 600 seconds

#### Scenario: Check blacklisted token

- **WHEN** TokenService checks blacklist status for `jti = "abc-123"` and the key exists in Redis
- **THEN** the method returns `true`

#### Scenario: Check non-blacklisted token

- **WHEN** TokenService checks blacklist status for `jti = "xyz-789"` and the key does not exist in Redis
- **THEN** the method returns `false`
