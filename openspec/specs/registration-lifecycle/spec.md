# Registration Lifecycle

Delta spec for the registration CRUD operations — create, read, cancel.

## ADDED Requirements

### Requirement: Register for Free Workshop

**Source:** FR-F04-003, BR-019, BR-020
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** STUDENT

Create a registration with CONFIRMED status for free workshops after passing all load control gates.

**Trigger:** `POST /registrations` with `workshop_id` of a free workshop

**Preconditions:**
- Workshop exists and is PUBLISHED
- Workshop `is_paid` = false
- Rate limits pass
- Seat available (DECR succeeded)
- Student not already registered for this workshop

**Postconditions:**
- Registration created with `status = CONFIRMED`
- Ticket created with `status = ACTIVE` and unique `qr_token`
- `REGISTRATION_CONFIRMED` event published to message queue (deferred to F06/F08)

#### Scenario: Successful free registration

- **Given** Free workshop with available seats
- **When** Student `POST /registrations { workshop_id }`
- **Then** Registration created with `status = CONFIRMED`
- **And** Ticket issued with unique `qr_token`
- **And** HTTP 201 returns `{ registration_id, ticket_id, status: "CONFIRMED" }`

#### Scenario: Duplicate registration

- **Given** Student already has an active registration for this workshop
- **When** Student `POST /registrations` again
- **Then** HTTP 409 `{ error: "REGISTRATION_DUPLICATE" }`

### Requirement: Register for Paid Workshop

**Source:** FR-F04-004, BR-019, BR-021, BR-022
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** STUDENT

Create a registration with PENDING_PAYMENT status for paid workshops and acquire a 15-minute seat lock.

**Trigger:** `POST /registrations` with `workshop_id` of a paid workshop

**Preconditions:**
- Workshop exists and is PUBLISHED
- Workshop `is_paid` = true
- Rate limits pass
- Seat available (DECR succeeded)
- Student not already registered

**Postconditions:**
- Registration created with `status = PENDING_PAYMENT`
- Seat lock acquired in Redis (TTL 900s)
- `payment_deadline` = `now() + 15 minutes`

#### Scenario: Successful paid registration

- **Given** Paid workshop (price = 200000 VND) with available seats
- **When** Student `POST /registrations { workshop_id }`
- **Then** Registration created with `status = PENDING_PAYMENT`
- **And** Redis key `seat:lock:{wid}:{rid}` exists with TTL = 900
- **And** HTTP 201 returns `{ registration_id, payment_deadline, amount: 200000 }`

#### Scenario: Seat lock holds for 15 minutes

- **Given** Seat lock acquired
- **When** 14 minutes pass
- **Then** `check()` returns `{ valid: true, remainingSeconds: ~60 }`
- **When** 15 minutes pass
- **Then** Redis key auto-expires, `check()` returns `SEAT_LOCK_EXPIRED`

### Requirement: Cancel Registration

**Source:** FR-F04-005, BR-019, BR-023
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** STUDENT

Cancel own registration, void the ticket, and release the seat.

**Trigger:** `DELETE /registrations/{id}`

**Preconditions:**
- Registration belongs to the authenticated student (IDOR check)
- Registration status is CONFIRMED or PENDING_PAYMENT (not already CANCELLED)

**Postconditions:**
- Registration `status = CANCELLED`, `cancelled_at = now()`
- Ticket `status = VOID`, `voided_at = now()` (if ticket exists)
- `seat:available:{wid}` incremented by 1
- `seat:lock:{wid}:{rid}` deleted (if paid workshop)
- `REGISTRATION_CANCELLED` event published (deferred to F08)

#### Scenario: Successful cancellation

- **Given** Student has a CONFIRMED registration with an ACTIVE ticket
- **When** Student `DELETE /registrations/{id}`
- **Then** Registration `status = CANCELLED`
- **And** Ticket `status = VOID`
- **And** `seat:available:{wid}` increases by 1
- **And** HTTP 200

#### Scenario: IDOR protection — cancel another student's registration

- **Given** Student A tries to cancel Student B's registration
- **When** Student A `DELETE /registrations/{b_reg_id}`
- **Then** HTTP 404 (no leak of record existence)

#### Scenario: Already cancelled

- **Given** Registration is already CANCELLED
- **When** Student `DELETE /registrations/{id}`
- **Then** HTTP 409 `{ error: "REGISTRATION_CANCELLED" }`

### Requirement: View Registration History

**Source:** FR-F04-006, BR-006
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** STUDENT

List own registrations with workshop and ticket details, enforcing IDOR.

**Trigger:** `GET /students/me/registrations`

**Behavior:**
- Query registrations where `student_id = jwt.sub`
- Include workshop summary (title, starts_at, room)
- Include ticket `qr_token` if status is CONFIRMED
- Support optional status filter
- Support pagination (cursor or offset)

#### Scenario: List with mixed statuses

- **Given** Student has 3 registrations (CONFIRMED, PENDING_PAYMENT, CANCELLED)
- **When** `GET /students/me/registrations`
- **Then** Returns all 3 with workshop title and ticket info where applicable

#### Scenario: IDOR enforced

- **Given** Student A calls the endpoint
- **When** Query executes
- **Then** `WHERE student_id = jwt.sub` — only Student A's registrations returned

### Requirement: Get Registration Detail

**Source:** FR-F04-006, BR-006
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** STUDENT

Get a single registration by ID with full details, enforcing ownership.

**Trigger:** `GET /students/me/registrations/{id}`

**Behavior:**
- Find registration by ID
- Verify `student_id = jwt.sub` (IDOR)
- Return registration with workshop, ticket, and payment details

#### Scenario: Own registration

- **Given** Student has registration `reg-123`
- **When** `GET /students/me/registrations/reg-123`
- **Then** Returns full registration detail with workshop info

#### Scenario: IDOR protection

- **Given** Registration `reg-456` belongs to Student B
- **When** Student A `GET /students/me/registrations/reg-456`
- **Then** HTTP 404
