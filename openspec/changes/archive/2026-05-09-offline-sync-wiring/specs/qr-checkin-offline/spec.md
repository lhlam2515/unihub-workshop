## ADDED Requirements

### Requirement: Display pending queue records in the mobile queue screen
The mobile app SHALL query all records from the local `checkin_queue` SQLite table and display them in the queue screen (SCR-M06), grouped by `sync_status`, ordered by `checked_in_at DESC`.

#### Scenario: Queue items rendered on screen load
- **WHEN** the staff opens the Queue tab (SCR-M06)
- **THEN** the screen SHALL render one `QueueItemRow` per record in `checkin_queue`, showing `student_name`, `student_code`, `qr_code`, `sync_status`, and `checked_in_at`

#### Scenario: Empty state when no records exist
- **WHEN** `checkin_queue` contains no records
- **THEN** the screen SHALL display an empty-state message instead of a list

### Requirement: All-workshop sync from the global queue screen
The mobile app's global queue screen SHALL trigger a sync of all PENDING records across all workshops when `workshopId` is omitted or empty.

#### Scenario: Sync all pending records when no workshop filter
- **WHEN** the staff taps "Đồng bộ" on the Queue tab with no workshop context
- **THEN** all PENDING records regardless of `workshop_id` SHALL be included in the batch sent to `POST /checkin/sync`

#### Scenario: Per-workshop sync from workshop dashboard remains intact
- **WHEN** sync is triggered from the workshop dashboard (SCR-M03) with a specific `workshopId`
- **THEN** only PENDING records matching that `workshop_id` are included in the batch
