## MODIFIED Requirements

### Requirement: Staff can log in with email and password
The login screen SHALL present an email input and a password input with a submit button. On submit, the app MUST call `POST /auth/login` with `accountType: "STAFF"` (uppercase) and store the returned tokens via `tokenStore.setTokens()`. On success, the app SHALL navigate to `/(tabs)`.

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

#### Scenario: accountType value is rejected by server when lowercase
- **WHEN** the request body contains `accountType: "staff"` (lowercase)
- **THEN** the server returns 400 Zod validation error and login fails
