## ADDED Requirements

### Requirement: AuthService authenticates users with email and password

The system SHALL validate user credentials by finding the user by email, comparing the provided password against the stored bcrypt hash, and checking that the user status is `ACTIVE`. On success, the system SHALL issue a dual-token pair via TokenService. On any failure (wrong email, wrong password, suspended account), the system SHALL return a generic `INVALID_CREDENTIALS` error to prevent user enumeration.

#### Scenario: Login with valid credentials on Web

- **WHEN** AuthService processes login with email `student@uni.edu`, correct password, and platform `WEB`
- **THEN** the method returns `Result.ok({ accessToken, refreshToken, expiresIn: 900, user })` and Refresh Token is not included in body (handled by controller for HttpOnly cookie)

#### Scenario: Login with valid credentials on Mobile

- **WHEN** AuthService processes login with correct credentials and platform `MOBILE`
- **THEN** the method returns `Result.ok({ accessToken, refreshToken, expiresIn: 28800, user })` and both tokens are returned in the result body

#### Scenario: Login with wrong password returns generic error

- **WHEN** AuthService processes login with email `student@uni.edu` and an incorrect password
- **THEN** the method returns `Result.fail(authErrors.invalidCredentials())`

#### Scenario: Login with non-existent email returns generic error

- **WHEN** AuthService processes login with an email that does not exist in the database
- **THEN** the method returns `Result.fail(authErrors.invalidCredentials())`

#### Scenario: Login with suspended account returns generic error

- **WHEN** AuthService processes login with valid credentials but the user status is `SUSPENDED`
- **THEN** the method returns `Result.fail(authErrors.invalidCredentials())`

### Requirement: AuthService refreshes tokens with rotation

The system SHALL verify the provided refresh token via TokenService, extract the user ID from the payload, and issue a new access token (and optionally a new refresh token with rotation). The consumed refresh token SHALL be blacklisted to implement refresh token rotation.

#### Scenario: Successful token refresh

- **WHEN** AuthService processes a refresh with a valid, non-blacklisted refresh token
- **THEN** the method returns a new access token and a new refresh token, and the consumed refresh token's `jti` is blacklisted

#### Scenario: Refresh with expired token

- **WHEN** AuthService processes a refresh with an expired refresh token
- **THEN** the method returns `Result.fail(authErrors.refreshTokenInvalid())`

#### Scenario: Refresh with already-used (blacklisted) token

- **WHEN** AuthService processes a refresh with a refresh token whose `jti` is already in the blacklist
- **THEN** the method returns `Result.fail(authErrors.refreshTokenInvalid())`

### Requirement: AuthService processes logout

The system SHALL blacklist the current access token's `jti` in Redis. Logout SHALL be idempotent — calling it multiple times with the same or an already-blacklisted token SHALL succeed silently.

#### Scenario: Successful logout

- **WHEN** AuthService processes logout for user `user-1` with token `jti = "abc-123"` and remaining TTL 600 seconds
- **THEN** Redis key `token:blacklist:abc-123` is set to `"revoked"` with TTL 600, and the method returns `Result.ok()`

#### Scenario: Idempotent logout

- **WHEN** AuthService processes logout with a token already in the blacklist
- **THEN** the method returns `Result.ok()` without error

### Requirement: AuthService returns current user info with role-specific fields

The system SHALL retrieve the current user by ID from UsersRepository. For `STUDENT` role, the response SHALL include student profile fields (`student_code`, `full_name`, `faculty`). For `CHECKIN_STAFF` role, the response SHALL include `allowed_workshop_ids`. For `ORGANIZER` role, only base user fields are returned.

#### Scenario: Get current user for STUDENT

- **WHEN** AuthService processes getMe for user ID `user-1` with role `STUDENT`
- **THEN** the result includes `email`, `role: "STUDENT"`, and student profile fields `student_code`, `full_name`, `faculty`

#### Scenario: Get current user for CHECKIN_STAFF

- **WHEN** AuthService processes getMe for user ID `user-2` with role `CHECKIN_STAFF`
- **THEN** the result includes `allowed_workshop_ids` with the staff member's assigned workshop IDs

#### Scenario: Get current user when user not found

- **WHEN** AuthService processes getMe for a user ID that does not exist
- **THEN** the method returns `Result.fail()` with a not-found error
