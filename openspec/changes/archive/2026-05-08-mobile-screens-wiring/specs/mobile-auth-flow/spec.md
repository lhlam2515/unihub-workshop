## ADDED Requirements

### Requirement: Staff can log in with email and password
The login screen SHALL present an email input and a password input with a submit button. On submit, the app MUST call `POST /auth/login` and store the returned tokens via `tokenStore.setTokens()`. On success, the app SHALL navigate to `/(tabs)`.

#### Scenario: Successful login
- **WHEN** staff enters valid email and password and taps submit
- **THEN** tokens are stored and the app navigates to the workshop list tab

#### Scenario: Invalid credentials
- **WHEN** staff enters wrong email or password
- **THEN** the screen displays an inline error message with code `INVALID_CREDENTIALS` and stays on the login screen

#### Scenario: Network error during login
- **WHEN** the device has no network connectivity during login attempt
- **THEN** the screen displays a network error message and the submit button is re-enabled

#### Scenario: Loading state during submission
- **WHEN** staff taps submit and the request is in-flight
- **THEN** the submit button is disabled and shows a loading indicator

### Requirement: App redirects authenticated staff to tabs on cold start
The root `index.tsx` SHALL call `offlineAuth.isTokenValidLocally()` after `tokenStore.init()` completes. If the token is valid, the app MUST redirect to `/(tabs)` without showing the login screen.

#### Scenario: Valid token on cold start
- **WHEN** staff reopens the app with a non-expired access token in SecureStore
- **THEN** the app redirects to `/(tabs)` without prompting for credentials

#### Scenario: No token or expired token on cold start
- **WHEN** staff opens the app with no token or an expired token
- **THEN** the app redirects to `/login`

### Requirement: Login client sends and persists tokens using correct field names
The `login()` function in `client/index.ts` MUST read `access_token` and `refresh_token` (snake_case) from the API response body, matching the backend `LoginResponseDto` field names.

#### Scenario: Tokens are persisted after login
- **WHEN** `POST /auth/login` returns a response with `access_token` and `refresh_token`
- **THEN** `tokenStore.setTokens(access_token, refresh_token)` is called with the correct values
