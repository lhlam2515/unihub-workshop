## ADDED Requirements

### Requirement: UsersService lists users with optional role filter and pagination

The system SHALL return a paginated list of users, optionally filtered by role. Each user SHALL be returned as a `UserResponseDto` excluding `password_hash`. The list SHALL be sorted by `created_at` descending.

#### Scenario: List all users

- **WHEN** UsersService processes listUsers with no role filter, page 1, limit 20
- **THEN** the method returns `Result.ok({ items: [...], total })` with all users ordered by creation date descending

#### Scenario: List users filtered by role

- **WHEN** UsersService processes listUsers with role filter `STUDENT`
- **THEN** the method returns only users with `role = 'STUDENT'`

#### Scenario: List users with pagination

- **WHEN** UsersService processes listUsers with page 2, limit 10 and total count 25
- **THEN** the method returns 10 items (offset 10) and total 25

### Requirement: UsersService retrieves a single user by ID

The system SHALL return a user by their ID. If not found, the system SHALL return `USER_NOT_FOUND`. The response SHALL exclude `password_hash`.

#### Scenario: Get existing user

- **WHEN** UsersService processes getUserById for an existing user ID
- **THEN** the method returns `Result.ok(UserResponseDto)` with `user_id`, `email`, `role`, `status`, `created_at`

#### Scenario: Get non-existent user

- **WHEN** UsersService processes getUserById for a non-existent user ID
- **THEN** the method returns `Result.fail(authErrors.userNotFound())`

### Requirement: UsersService updates user status with token revocation

The system SHALL update a user's `status` field. If the new status is `SUSPENDED`, the system SHALL also blacklist the current access token (identified by `jti`) used to make the request. This prevents the suspended user from continuing to use their current session.

#### Scenario: Suspend a user with token revocation

- **WHEN** UsersService updates user `user-1` status to `SUSPENDED` and provides the admin's current token `jti`
- **THEN** the user's status is set to `SUSPENDED` and the user's token is blacklisted in Redis

#### Scenario: Activate a suspended user

- **WHEN** UsersService updates user `user-1` status to `ACTIVE`
- **THEN** the user's status is set to `ACTIVE` and no token blacklist operation occurs

#### Scenario: Suspend a non-existent user

- **WHEN** UsersService updates status for a user ID that does not exist
- **THEN** the method returns `Result.fail()` with a not-found error

### Requirement: UsersService revokes all tokens for a user

The system SHALL provide a manual token revocation endpoint for organizers. Since the system does not track all issued tokens, this SHALL revoke the user's current session and mark them for re-authentication. The implementation SHALL update the user's `updated_at` timestamp and blacklist any known token `jti` values.

#### Scenario: Revoke tokens for a user

- **WHEN** UsersService processes revokeUserTokens for user `user-1`
- **THEN** the method returns `Result.ok()` with a success confirmation
