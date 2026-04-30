## ADDED Requirements

### Requirement: Organizer performs emergency update on PUBLISHED workshop
The system SHALL allow ORGANIZER to update room_id, starts_at, or ends_at on a PUBLISHED workshop. At least one of the three fields MUST be provided. If room_id or time range changes, the system SHALL re-check for room scheduling conflicts.

#### Scenario: Successful emergency room change
- **WHEN** ORGANIZER calls PATCH /admin/workshops/{id}/emergency-update with a new room_id for a PUBLISHED workshop
- **THEN** system updates the room_id, re-checks for conflicts (no overlapping PUBLISHED workshop in the new room at the same time), and returns updated WorkshopAdminDetailDto

#### Scenario: Successful emergency schedule change
- **WHEN** ORGANIZER calls PATCH /admin/workshops/{id}/emergency-update with new starts_at and ends_at
- **THEN** system updates the schedule, re-checks for conflicts, and returns updated WorkshopAdminDetailDto

#### Scenario: Room conflict on emergency update
- **WHEN** ORGANIZER submits an emergency update that would create an overlapping time slot with another PUBLISHED workshop in the target room
- **THEN** system returns FailResult with WORKSHOP_TIME_CONFLICT error

#### Scenario: No fields provided
- **WHEN** ORGANIZER calls emergency update without providing any of room_id, starts_at, or ends_at
- **THEN** system returns FailResult with VALIDATION_FAILED error

#### Scenario: Emergency update on non-PUBLISHED workshop
- **WHEN** ORGANIZER attempts emergency update on a DRAFT or CANCELLED workshop
- **THEN** system returns FailResult — emergency updates only apply to PUBLISHED workshops

#### Scenario: Emergency update non-existent workshop
- **WHEN** ORGANIZER attempts emergency update on a non-existent workshop
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND
