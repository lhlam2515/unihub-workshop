## ADDED Requirements

### Requirement: Issue ticket on registration confirmation
The system SHALL create one ticket per confirmed registration, generating a unique `qr_token` (UUID) and setting status to `ACTIVE`. A registration MAY have at most one ticket (enforced by `UNIQUE(registration_id)` on the tickets table).

#### Scenario: Ticket issued successfully
- **WHEN** `TicketService.issueTicket(registrationId, workshopId)` is called for a CONFIRMED registration
- **THEN** a ticket record is inserted with `status = ACTIVE`, a randomly generated `qr_token`, and `issued_at = now()`

#### Scenario: Duplicate issuance rejected
- **WHEN** `issueTicket` is called for a `registration_id` that already has a ticket
- **THEN** the operation fails with a unique constraint error and no duplicate ticket is created

### Requirement: Void ticket on registration cancellation
The system SHALL mark a ticket as `VOID` and set `voided_at = now()` when the associated registration is cancelled. Voided tickets cannot be used for check-in.

#### Scenario: Ticket voided successfully
- **WHEN** `TicketService.voidTicket(registrationId)` is called
- **THEN** the ticket's `status` is updated to `VOID` and `voided_at` is set

#### Scenario: Voided ticket rejected at scan
- **WHEN** a CHECKIN_STAFF scans the `qr_token` of a VOID ticket
- **THEN** the system SHALL return an error indicating the ticket is invalid

### Requirement: Student can view own active tickets
The system SHALL allow a STUDENT to retrieve all their ACTIVE tickets including associated workshop information. Results SHALL be scoped to `student_id = jwt.sub` (IDOR protection).

#### Scenario: Student retrieves ticket list
- **WHEN** `GET /students/me/tickets` is called with a valid STUDENT JWT
- **THEN** the system returns all ACTIVE tickets for that student with workshop title, date, and QR token

#### Scenario: Student cannot view another student's tickets
- **WHEN** a STUDENT requests ticket detail for a `ticket_id` not belonging to them
- **THEN** the system SHALL return 404 (not 403, to avoid confirming existence)
