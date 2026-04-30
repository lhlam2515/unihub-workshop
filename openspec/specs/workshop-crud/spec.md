# Workshop CRUD

Purpose: Full lifecycle management of workshops — create, update, list, view, and stat tracking for both public (student) and admin (organizer) contexts.

## ADDED Requirements

### Requirement: Organizer creates workshop as DRAFT
The system SHALL allow ORGANIZER to create a new workshop in DRAFT status. The created workshop SHALL have a corresponding `workshop_slots` record with `total_capacity` set to the workshop's capacity and both counters initialized to zero.

#### Scenario: Successful DRAFT creation
- **WHEN** ORGANIZER submits valid workshop data (title, speaker_id, room_id, starts_at, ends_at, capacity, is_paid with optional price)
- **THEN** system creates workshop with status DRAFT, inserts workshop_slots with total_capacity = capacity, locked_count = 0, confirmed_count = 0, and returns WorkshopAdminDetailDto

#### Scenario: Room scheduling conflict detected
- **WHEN** ORGANIZER submits workshop data whose room_id + time range overlaps with an existing PUBLISHED workshop in the same room
- **THEN** system returns FailResult with WORKSHOP_TIME_CONFLICT error

#### Scenario: Time validation failure
- **WHEN** ORGANIZER submits workshop data with ends_at <= starts_at
- **THEN** system returns FailResult with VALIDATION_FAILED error

#### Scenario: Price validation failure
- **WHEN** ORGANIZER submits workshop with is_paid = true but no price
- **THEN** system returns FailResult with VALIDATION_FAILED error

### Requirement: Organizer updates DRAFT workshop
The system SHALL allow ORGANIZER to update a workshop only when its status is DRAFT. All top-level fields in UpdateWorkshopDto are optional (partial update).

#### Scenario: Successful DRAFT update
- **WHEN** ORGANIZER submits partial update data for a DRAFT workshop
- **THEN** system updates only the provided fields and returns WorkshopAdminDetailDto

#### Scenario: Update blocked on non-DRAFT workshop
- **WHEN** ORGANIZER attempts to update a PUBLISHED or CANCELLED workshop via the update endpoint
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND or BUSINESS error

### Requirement: Admin lists all workshops
The system SHALL allow ORGANIZER to list all workshops regardless of status, with optional status filtering and pagination.

#### Scenario: List with pagination
- **WHEN** ORGANIZER requests GET /admin/workshops?page=1&limit=20
- **THEN** system returns paginated list of WorkshopAdminDetailDto with confirmed_count and locked_count from workshop_slots

#### Scenario: Filter by status
- **WHEN** ORGANIZER requests GET /admin/workshops?status=PUBLISHED
- **THEN** system returns only workshops with status PUBLISHED

### Requirement: Admin views workshop detail
The system SHALL allow ORGANIZER to view full workshop detail including admin-specific fields (confirmed_count, locked_count, created_by).

#### Scenario: Admin detail with slot counts
- **WHEN** ORGANIZER requests GET /admin/workshops/{id}
- **THEN** system returns WorkshopAdminDetailDto with confirmed_count and locked_count from workshop_slots

#### Scenario: Admin detail not found
- **WHEN** ORGANIZER requests GET /admin/workshops/{non-existent-id}
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND

### Requirement: Admin views workshop statistics
The system SHALL allow ORGANIZER to view workshop statistics including registration counts and seat availability.

#### Scenario: Stats for active workshop
- **WHEN** ORGANIZER requests GET /admin/workshops/{id}/stats
- **THEN** system returns confirmed_count, locked_count, available_seats (from Redis with DB fallback), and total_capacity

### Requirement: Student lists published workshops
The system SHALL allow any user (public) to list PUBLISHED workshops with optional filters for date range and payment type. Each result SHALL include available_seats from Redis.

#### Scenario: List all published
- **WHEN** any user requests GET /workshops
- **THEN** system returns paginated list of WorkshopSummaryDto with available_seats from Redis seat counter

#### Scenario: Filter by date range
- **WHEN** user requests GET /workshops?date_from=2026-05-01&date_to=2026-05-31
- **THEN** system returns only workshops with starts_at within the date range

### Requirement: Student views workshop public detail
The system SHALL allow any user to view a PUBLISHED workshop's detail with speaker info, room info, and available seat count from Redis.

#### Scenario: Public detail with AI summary
- **WHEN** user requests GET /workshops/{id} for a PUBLISHED workshop
- **THEN** system returns WorkshopDetailDto including speaker_name, room_name, available_seats, and AI summary (if status is DONE)

#### Scenario: Public detail not found or not published
- **WHEN** user requests GET /workshops/{id} for a DRAFT or CANCELLED workshop
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND
