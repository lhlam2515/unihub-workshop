# Speaker Management — Delta Spec

Purpose: Add update capability so ORGANIZER can edit existing speaker profiles, matching the speaker edit form at `/admin/speakers/[speakerId]/edit` in screens.md (SCR-W23).

## ADDED Requirements

### Requirement: Admin updates a speaker

The system SHALL allow ORGANIZER to update an existing speaker's profile attributes. All fields in the update payload SHALL be optional (partial update).

#### Scenario: Successful speaker update with all fields
- **WHEN** ORGANIZER submits `PUT /admin/speakers/{id}` with `{ full_name, title, bio, avatar_url }`
- **THEN** system updates all provided fields on the speaker and returns `SpeakerResponseDto` with the new values

#### Scenario: Partial speaker update (only title and bio)
- **WHEN** ORGANIZER submits `PUT /admin/speakers/{id}` with `{ title: "New Title", bio: "Updated bio" }` only
- **THEN** system updates only title and bio; `full_name` and `avatar_url` retain their existing values; returns `SpeakerResponseDto`

#### Scenario: Speaker not found
- **WHEN** ORGANIZER submits `PUT /admin/speakers/{non-existent-id}`
- **THEN** system returns `FailResult` with `SPEAKER_NOT_FOUND`

#### Scenario: Empty full_name
- **WHEN** ORGANIZER submits `PUT /admin/speakers/{id}` with `{ full_name: "" }`
- **THEN** system returns `FailResult` with `VALIDATION_FAILED` (full_name must be at least 1 character if provided)
