# Workshop Cancel

Purpose: Cancel a workshop, transitioning it to CANCELLED status with cleanup of Redis seat counter. Documents the cross-module contract for cascading to registrations once Booking module exists.

## ADDED Requirements

### Requirement: Organizer cancels a workshop
The system SHALL allow ORGANIZER to cancel a workshop (DRAFT or PUBLISHED), transitioning it to CANCELLED status. When cancelling a PUBLISHED workshop, the system SHALL delete the Redis seat availability counter.

#### Scenario: Cancel a PUBLISHED workshop
- **WHEN** ORGANIZER calls POST /admin/workshops/{id}/cancel on a PUBLISHED workshop
- **THEN** system transitions status to CANCELLED, deletes Redis key `seat:available:{workshopId}`, and returns updated WorkshopAdminDetailDto

#### Scenario: Cancel a DRAFT workshop
- **WHEN** ORGANIZER calls POST /admin/workshops/{id}/cancel on a DRAFT workshop
- **THEN** system transitions status to CANCELLED (no Redis key to delete) and returns updated WorkshopAdminDetailDto

#### Scenario: Cancel already-cancelled workshop
- **WHEN** ORGANIZER attempts to cancel a workshop already in CANCELLED status
- **THEN** system returns FailResult with WORKSHOP_CANCELLED error

#### Scenario: Cancel non-existent workshop
- **WHEN** ORGANIZER attempts to cancel a workshop that does not exist
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND

### Requirement: Redis counter deleted on cancel
The system SHALL delete the Redis key `seat:available:{workshopId}` when a PUBLISHED workshop is cancelled, preventing further seat reservations.

#### Scenario: Counter deleted
- **WHEN** a PUBLISHED workshop with Redis counter is cancelled
- **THEN** Redis key `seat:available:{workshopId}` no longer exists

#### Scenario: Counter deletion is idempotent
- **WHEN** cancelling a DRAFT workshop (which has no Redis counter)
- **THEN** no error is raised from the missing Redis key
