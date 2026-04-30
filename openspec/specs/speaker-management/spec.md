# Speaker Management

Purpose: Manage speaker profiles — list and create with basic profile fields.

## ADDED Requirements

### Requirement: Admin lists all speakers
The system SHALL allow ORGANIZER to list all speakers.

#### Scenario: List speakers
- **WHEN** ORGANIZER requests GET /admin/speakers
- **THEN** system returns array of SpeakerResponseDto with speaker_id, full_name, title, bio, avatar_url

### Requirement: Admin creates a speaker
The system SHALL allow ORGANIZER to create a new speaker with full_name required and optional title, bio, avatar_url.

#### Scenario: Successful speaker creation with full profile
- **WHEN** ORGANIZER submits speaker data with full_name, title, bio, avatar_url
- **THEN** system creates speaker and returns SpeakerResponseDto with all fields mapped (camelCase DB → snake_case API)

#### Scenario: Minimal speaker creation
- **WHEN** ORGANIZER submits speaker data with only full_name
- **THEN** system creates speaker with title, bio, avatar_url as null and returns SpeakerResponseDto

#### Scenario: Missing full_name
- **WHEN** ORGANIZER submits speaker data without full_name
- **THEN** system returns FailResult with VALIDATION_FAILED
