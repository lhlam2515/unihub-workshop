# Room Management

Purpose: Manage venue rooms — CRUD operations and scheduling conflict detection.

## ADDED Requirements

### Requirement: Admin lists all rooms
The system SHALL allow ORGANIZER to list all rooms.

#### Scenario: List rooms
- **WHEN** ORGANIZER requests GET /admin/rooms
- **THEN** system returns array of RoomResponseDto with room_id, name, building, floor, capacity, floor_plan_url, facilities

### Requirement: Admin creates a room
The system SHALL allow ORGANIZER to create a new room with capacity validation (capacity > 0).

#### Scenario: Successful room creation
- **WHEN** ORGANIZER submits valid room data (name, building, floor, capacity > 0, optional facilities, optional floor_plan_url)
- **THEN** system creates room and returns RoomResponseDto

#### Scenario: Invalid room capacity
- **WHEN** ORGANIZER submits room data with capacity <= 0
- **THEN** system returns FailResult with VALIDATION_FAILED or DB constraint error

### Requirement: Room conflict detection
The system SHALL detect when two PUBLISHED workshops are scheduled in the same room with overlapping time ranges and prevent the conflict.

#### Scenario: Overlap detected
- **WHEN** a service calls RoomConflictService.checkConflict(roomId, startsAt, endsAt) and another PUBLISHED workshop exists with room_id = roomId AND starts_at < endsAt AND ends_at > startsAt
- **THEN** service returns FailResult with WORKSHOP_TIME_CONFLICT

#### Scenario: No overlap
- **WHEN** a service calls RoomConflictService.checkConflict(roomId, startsAt, endsAt) and no overlapping PUBLISHED workshop exists
- **THEN** service returns OkResult with void

#### Scenario: Adjacent non-overlapping slots
- **WHEN** Workshop A ends at 10:00 and Workshop B starts at 10:00 in the same room
- **THEN** no conflict is detected (ends_at is exclusive boundary)

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
