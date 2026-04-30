## ADDED Requirements

### Requirement: Organizer publishes a DRAFT workshop
The system SHALL allow ORGANIZER to publish a workshop, transitioning it from DRAFT to PUBLISHED status. Publishing SHALL initialize the Redis seat availability counter and set up the workshop_slots record.

#### Scenario: Successful publish
- **WHEN** ORGANIZER calls POST /admin/workshops/{id}/publish on a DRAFT workshop
- **THEN** system transitions status to PUBLISHED, inserts workshop_slots row with total_capacity = capacity (if not already created), initializes Redis key `seat:available:{workshopId}` = capacity, and returns updated WorkshopAdminDetailDto

#### Scenario: Publish already-published workshop
- **WHEN** ORGANIZER attempts to publish a workshop already in PUBLISHED status
- **THEN** system returns FailResult with BUSINESS error

#### Scenario: Publish cancelled workshop
- **WHEN** ORGANIZER attempts to publish a CANCELLED workshop
- **THEN** system returns FailResult with WORKSHOP_CANCELLED error

#### Scenario: Publish non-existent workshop
- **WHEN** ORGANIZER attempts to publish a workshop that does not exist
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND

### Requirement: Redis seat counter initialized on publish
The system SHALL initialize a Redis key `seat:available:{workshopId}` set to the workshop's total capacity when the workshop is published.

#### Scenario: Counter key set
- **WHEN** a workshop is successfully published with capacity 50
- **THEN** Redis contains key `seat:available:{workshopId}` with value 50

#### Scenario: Counter survives for Booking module
- **WHEN** the seat counter is initialized
- **THEN** the Redis key has no TTL (persistent until explicitly deleted on cancel) so Booking module can atomically DECR it
