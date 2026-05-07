## Purpose

Enable check-in staff to scan workshop tickets via QR code in real-time and retrieve live check-in statistics during workshop events.

## Requirements

### Requirement: Validate QR token and record online check-in
The system SHALL accept a `qr_token` and `workshop_id` from CHECKIN_STAFF, look up the ticket by `qr_token`, verify the ticket is ACTIVE and belongs to the given workshop, then insert a `checkin_records` entry with `source = ONLINE`.

#### Scenario: Successful online check-in
- **WHEN** `POST /checkin/scan` is called with a valid `qr_token` for an ACTIVE ticket in the staff's assigned workshop
- **THEN** a `checkin_records` entry is created with `source = ONLINE`, `checked_in_at = now()`, `checked_in_by = jwt.sub`, and the response includes ticket and student details

#### Scenario: Already checked-in ticket
- **WHEN** `POST /checkin/scan` is called for a ticket that already has a `checkin_records` entry for the same workshop
- **THEN** the system SHALL return an error indicating the ticket was already checked in (unique constraint on `ticket_id, workshop_id`)

#### Scenario: VOID ticket rejected
- **WHEN** `POST /checkin/scan` is called with the `qr_token` of a VOID ticket
- **THEN** the system SHALL return an error indicating the ticket is invalid

#### Scenario: QR token not found
- **WHEN** `POST /checkin/scan` is called with an unrecognised `qr_token`
- **THEN** the system SHALL return 404

#### Scenario: Workshop scope enforced
- **WHEN** CHECKIN_STAFF scans a valid ticket but the `workshop_id` is not in their `allowed_workshop_ids` JWT claim
- **THEN** `WorkshopScopeGuard` rejects the request with 403 before reaching the service

### Requirement: Get workshop check-in status
The system SHALL allow CHECKIN_STAFF to retrieve real-time check-in statistics for a workshop, including confirmed registration count, checked-in count, and the 20 most recent check-ins.

#### Scenario: Status retrieved successfully
- **WHEN** `GET /checkin/workshops/:id/status` is called by a CHECKIN_STAFF
- **THEN** the response includes `confirmed_count`, `checked_in_count`, `pending_count`, and `recent_checkins` (last 20, ordered by `checked_in_at DESC`)
