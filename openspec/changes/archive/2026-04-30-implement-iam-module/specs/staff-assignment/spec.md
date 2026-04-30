## ADDED Requirements

### Requirement: Organizer assigns workshops to check-in staff

The system SHALL allow an ORGANIZER to assign a list of workshop IDs to a CHECKIN_STAFF user. The assignment SHALL be upserted (insert if new, update if existing). The response SHALL include an eventual consistency warning indicating the changes take effect on the staff member's next login.

#### Scenario: Assign workshops to a check-in staff member

- **WHEN** Organizer assigns workshop IDs `["wid-A", "wid-B"]` to user `user-1` who has role `CHECKIN_STAFF`
- **THEN** the assignment is persisted to `checkin_staff_assignments` with `workshop_ids: ["wid-A", "wid-B"]` and the response includes an eventual consistency warning

#### Scenario: Update existing assignment

- **WHEN** Organizer assigns workshop IDs `["wid-C"]` to user `user-1` who already has `["wid-A", "wid-B"]` assigned
- **THEN** the existing record is updated with `workshop_ids: ["wid-C"]` (replace, not merge)

#### Scenario: Assign workshops to non-check-in-staff user

- **WHEN** Organizer attempts to assign workshops to a user with role `STUDENT`
- **THEN** the method returns `Result.fail()` with a validation error

#### Scenario: Assign workshops to non-existent user

- **WHEN** Organizer attempts to assign workshops to a user ID that does not exist
- **THEN** the method returns `Result.fail()` with a user-not-found error

### Requirement: Organizer retrieves assigned workshops for check-in staff

The system SHALL return the list of workshop IDs currently assigned to a CHECKIN_STAFF user. If no assignment record exists, an empty list SHALL be returned.

#### Scenario: Get assigned workshops for staff with assignments

- **WHEN** Organizer queries assigned workshops for user `user-1`
- **THEN** the method returns `Result.ok({ user_id, workshop_ids: ["wid-A", "wid-B"] })`

#### Scenario: Get assigned workshops for staff with no assignments

- **WHEN** Organizer queries assigned workshops for user `user-1` who has no assignment record
- **THEN** the method returns `Result.ok({ user_id, workshop_ids: [] })`
