## ADDED Requirements

### Requirement: QR scanner triggers online check-in via useScan hook
The QR scanner screen SHALL pass the scanned `qr_token` and `workshopId` to `useScan`, which calls `checkinApi.scanOnline()` for the online path. On a successful online scan, the hook navigates to the result screen with `source = online` and the student name.

#### Scenario: Online scan success navigates to result
- **WHEN** `useScan` calls `checkinApi.scanOnline()` and receives a successful response
- **THEN** the app navigates to `/workshop/:id/result` with `source=online`, `name=<studentName>`, and `code=<studentCode>`

#### Scenario: Business error surfaces without offline fallback
- **WHEN** `scanOnline()` returns a business error (TICKET_VOID, TICKET_ALREADY_CHECKEDIN)
- **THEN** the result screen shows the error code and does NOT attempt an offline fallback

### Requirement: Workshop dashboard shows real-time check-in statistics
The workshop dashboard screen (`/workshop/:id`) SHALL display live statistics from `GET /checkin/workshops/:id/status`, showing confirmed registration count, checked-in count, and pending count.

#### Scenario: Dashboard loads real stats
- **WHEN** staff opens the workshop dashboard
- **THEN** the screen fetches and displays `confirmed_count`, `checked_in_count`, and `pending_count` from the API

#### Scenario: Dashboard shows loading state
- **WHEN** the stats API call is in-flight
- **THEN** the stat cards display loading placeholders

#### Scenario: Dashboard shows error state
- **WHEN** the stats API call fails
- **THEN** the screen displays an error message with a retry button
