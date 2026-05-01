## ADDED Requirements

### Requirement: Staff can preload active tickets for a workshop
The system SHALL allow CHECKIN_STAFF to fetch all ACTIVE tickets for a given workshop via `GET /checkin/workshops/:id/tickets`. The response is used by the mobile app to populate its local SQLite cache before going offline. The endpoint SHALL enforce workshop scope (`WorkshopScopeGuard`).

#### Scenario: Successful preload
- **WHEN** `GET /checkin/workshops/:id/tickets` is called by a CHECKIN_STAFF assigned to that workshop
- **THEN** the system returns all ACTIVE tickets for the workshop including `ticket_id`, `qr_token`, `registration_id`, and student identity fields

#### Scenario: Workshop scope enforced on preload
- **WHEN** CHECKIN_STAFF requests tickets for a workshop not in their `allowed_workshop_ids`
- **THEN** `WorkshopScopeGuard` rejects the request with 403

#### Scenario: Empty workshop returns empty list
- **WHEN** `GET /checkin/workshops/:id/tickets` is called for a workshop with no confirmed registrations
- **THEN** the system returns an empty array (not 404)
