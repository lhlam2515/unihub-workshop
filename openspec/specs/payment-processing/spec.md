# Payment Processing

Specification for the F05 Payment Processing module — idempotency, circuit breaker, payment initiation, webhook processing, and ticket issuance.

## ADDED Requirements

### Requirement: Idempotency key check prevents duplicate payments

The system SHALL check the idempotency key via Redis SET NX (Layer 1) before creating any payment record. If the key already exists, the system SHALL return the existing payment result without touching the database. The idempotency key SHALL have a 24-hour TTL in Redis. A PostgreSQL UNIQUE constraint on `payments.idempotency_key` (Layer 2) SHALL serve as the ultimate guard.

**Source:** FR-F05-001, BR-022, BR-024
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: First request with new idempotency key

- **WHEN** a payment request arrives with a new idempotency key
- **THEN** Redis SET NX succeeds, the key is stored with TTL 86400, and the payment flow proceeds

#### Scenario: Duplicate request with same idempotency key

- **WHEN** a payment request arrives with an idempotency key that already exists in Redis
- **THEN** the system returns `PAYMENT_DUPLICATE` error with the existing `payment_id` without executing any database operation

#### Scenario: Idempotency key updated after payment creation

- **WHEN** a payment record is successfully created
- **THEN** the idempotency key value in Redis is updated from placeholder to the actual `payment_id`

### Requirement: Circuit breaker protects against gateway failures

The system SHALL maintain a circuit breaker state machine per payment gateway in Redis Hash `circuit:payment:{gateway}`. The circuit SHALL transition CLOSED→OPEN after 5 failures within 60 seconds. The circuit SHALL transition OPEN→HALF_OPEN after 30 seconds cool-down. The circuit SHALL transition HALF_OPEN→CLOSED after 1 successful canary request. While OPEN, the system SHALL reject all payment requests for that gateway with `PAYMENT_GATEWAY_OPEN` without calling the external gateway.

**Source:** FR-F05-002, FR-F05-004, BR-025, BR-026
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Circuit closed — requests flow normally

- **WHEN** a payment request targets a gateway with circuit state CLOSED
- **THEN** the request proceeds to the gateway adapter normally

#### Scenario: Circuit opens after threshold failures

- **WHEN** 5 gateway calls fail within a 60-second window
- **THEN** the circuit transitions to OPEN state with `opened_at` timestamp recorded
- **AND** subsequent requests are rejected immediately with `PAYMENT_GATEWAY_OPEN`

#### Scenario: Circuit half-opens after cool-down

- **WHEN** a request arrives for an OPEN circuit where `NOW() - opened_at >= 30 seconds`
- **THEN** the circuit transitions to HALF_OPEN and the request proceeds as a canary

#### Scenario: Successful canary closes circuit

- **WHEN** a HALF_OPEN circuit receives a successful gateway response
- **THEN** the circuit transitions back to CLOSED and `failure_count` is reset to 0

#### Scenario: Failed canary re-opens circuit

- **WHEN** a HALF_OPEN circuit receives a failed gateway response
- **THEN** the circuit transitions back to OPEN with a new `opened_at` timestamp

### Requirement: Payment initiation validates seat lock before proceeding

The system SHALL verify that the registration's seat lock is still valid before creating a payment. If the seat lock has expired (TTL = 0), the system SHALL return `SEAT_LOCK_EXPIRED` and not create a payment record.

**Source:** FR-F05-005, BR-021
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Valid seat lock — payment proceeds

- **WHEN** a payment request arrives for a registration with an active seat lock (TTL > 0)
- **THEN** the payment flow continues to idempotency and circuit breaker checks

#### Scenario: Expired seat lock — payment rejected

- **WHEN** a payment request arrives for a registration whose seat lock TTL has reached 0
- **THEN** the system returns `SEAT_LOCK_EXPIRED` without creating a payment record

### Requirement: Payment record created with pessimistic locking

The system SHALL insert a payment record with status PENDING and a `timeout_at` timestamp set to 15 minutes from creation. The system SHALL use pessimistic locking (`FOR UPDATE NOWAIT`) on the workshop slot with a statement timeout of 3 seconds. If the lock cannot be acquired within 3 seconds, the system SHALL return `DB_LOCK_TIMEOUT`.

**Source:** FR-F05-005, BR-028
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Payment created successfully

- **WHEN** all checks pass (idempotency, circuit breaker, seat lock)
- **THEN** a payment record is inserted with status PENDING, `timeout_at = NOW() + 15 minutes`, and the idempotency key is stored

#### Scenario: Database lock timeout

- **WHEN** the workshop slot row is locked by another concurrent transaction for more than 3 seconds
- **THEN** the system returns `DB_LOCK_TIMEOUT` and the payment is not created

### Requirement: Gateway adapter returns redirect URL

The system SHALL delegate to the appropriate gateway adapter based on the `gateway` field. The MOCK adapter SHALL return a simulated redirect URL and gateway transaction ID. The adapter SHALL have a switch structure with placeholder cases for VNPAY, STRIPE, and MOMO.

**Source:** FR-F05-003
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** System

#### Scenario: MOCK gateway returns simulated redirect

- **WHEN** the payment gateway is MOCK
- **THEN** the adapter returns a fake `redirect_url` and `gateway_txn_id` without making external HTTP calls

### Requirement: Successful webhook processes payment in ACID transaction

The system SHALL process a successful payment webhook within a single database transaction. The transaction SHALL: update payment status to SUCCESS with `gateway_txn_id` and `completed_at`, update registration status to CONFIRMED with `confirmed_at`, insert a ticket with status ACTIVE and a unique QR token, and delete the seat lock from Redis. All steps SHALL commit atomically or roll back entirely.

**Source:** FR-F05-003, BR-027
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System (Webhook from Payment Gateway)

#### Scenario: Successful payment webhook

- **WHEN** a webhook arrives with status SUCCESS and valid idempotency key
- **THEN** payment status becomes SUCCESS, registration status becomes CONFIRMED, a ticket is issued with ACTIVE status, the seat lock is deleted from Redis, and a `PAYMENT_SUCCESS` event is published to the notification queue

#### Scenario: Webhook for already-successful payment

- **WHEN** a webhook arrives for a payment that is already in SUCCESS status
- **THEN** the system returns `PAYMENT_ALREADY_SUCCESS` without modifying any data

#### Scenario: Webhook for non-existent payment

- **WHEN** a webhook arrives with an idempotency key that does not match any payment
- **THEN** the system returns `PAYMENT_NOT_FOUND`

### Requirement: Failed webhook releases resources

The system SHALL process a failed payment webhook by updating payment status to FAILED and releasing the seat lock and seat counter. The registration status SHALL remain PENDING_PAYMENT to allow retry.

**Source:** FR-F05-003
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System

#### Scenario: Failed payment webhook

- **WHEN** a webhook arrives with status FAILED
- **THEN** payment status becomes FAILED, the seat lock is released, the available seat counter is incremented, and a `PAYMENT_FAILED` event is published

### Requirement: Payment expiration releases seats

The system SHALL provide an `expirePayment` method that transitions an overdue PENDING payment to TIMEOUT, cancels the associated registration, increments the available seat counter, and releases the seat lock. The operation SHALL execute within a database transaction.

**Source:** FR-F10-001, BR-039
**Priority:** MUST
**Classification:** FULLY AUTOMATED
**Actor:** System (called by W4 PaymentTimeoutCron)

#### Scenario: Payment expired — seat released

- **WHEN** `expirePayment` is called for an overdue PENDING payment
- **THEN** payment status becomes TIMEOUT, registration status becomes CANCELLED, available seat counter is incremented, seat lock is deleted, and a `PAYMENT_FAILED` event is published

### Requirement: Students can view their own payments

The system SHALL return a paginated list of payments owned by the authenticated student. The system SHALL enforce IDOR by filtering `WHERE student_id = jwt.sub`.

**Source:** FR-F01-007, BR-006
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** Student

#### Scenario: Student lists own payments

- **WHEN** a student requests `GET /students/me/payments`
- **THEN** only payments where `student_id` matches the JWT subject are returned, paginated

#### Scenario: Student views payment detail

- **WHEN** a student requests `GET /students/me/payments/{id}`
- **THEN** the payment detail is returned if owned by the student, or `PAYMENT_NOT_FOUND` if the payment belongs to another student
