# Room Management — Delta Spec

Purpose: Add update capability so ORGANIZER can edit existing room details, matching the room edit form at `/admin/rooms/[roomId]/edit` in screens.md (SCR-W21).

## ADDED Requirements

### Requirement: Admin updates a room

The system SHALL allow ORGANIZER to update an existing room's attributes. All fields in the update payload SHALL be optional (partial update).

#### Scenario: Successful room update with all fields
- **WHEN** ORGANIZER submits `PUT /admin/rooms/{id}` with `{ name, building, floor, capacity, floor_plan_url, facilities }`
- **THEN** system updates all provided fields on the room and returns `RoomResponseDto` with the new values

#### Scenario: Partial room update (only name)
- **WHEN** ORGANIZER submits `PUT /admin/rooms/{id}` with `{ name: "New Name" }` only
- **THEN** system updates only the name field; all other fields retain their existing values; returns `RoomResponseDto`

#### Scenario: Room not found
- **WHEN** ORGANIZER submits `PUT /admin/rooms/{non-existent-id}`
- **THEN** system returns `FailResult` with `ROOM_NOT_FOUND`

#### Scenario: Invalid capacity
- **WHEN** ORGANIZER submits `PUT /admin/rooms/{id}` with `{ capacity: 0 }`
- **THEN** system returns `FailResult` with `VALIDATION_FAILED` (capacity must be positive)
