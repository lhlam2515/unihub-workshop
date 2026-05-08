## ADDED Requirements

### Requirement: Staff can view check-in history for a workshop
The check-in history screen (`/workshop/:id/history`) SHALL query the local `checkinQueue` SQLite table filtered by `workshopId`, ordered by `checkedInAt` descending. Each record MUST display student name, check-in time, and sync status badge (PENDING / SYNCED / CONFLICT / FAILED).

#### Scenario: History screen shows local check-in records
- **WHEN** staff navigates to the history screen for a workshop
- **THEN** all check-in records for that workshop are shown, newest first, with sync status badges

#### Scenario: Empty history
- **WHEN** no check-in records exist in SQLite for the workshop
- **THEN** the screen shows an empty state indicating no check-ins have been recorded yet

#### Scenario: Records show correct sync status
- **WHEN** a record has `syncStatus = PENDING`
- **THEN** the badge displays "Chưa đồng bộ" (pending/unsynced) in yellow

#### Scenario: Synced record badge
- **WHEN** a record has `syncStatus = SYNCED`
- **THEN** the badge displays "Đã đồng bộ" (synced) in green

#### Scenario: Conflict record badge
- **WHEN** a record has `syncStatus = CONFLICT`
- **THEN** the badge displays "Xung đột" (conflict) in red

### Requirement: History screen is accessible from the workshop dashboard
The workshop dashboard screen SHALL include a navigation link to the history screen for the same workshop.

#### Scenario: Staff taps history link from dashboard
- **WHEN** staff taps the history link on the workshop dashboard
- **THEN** the app navigates to `/workshop/:id/history`
