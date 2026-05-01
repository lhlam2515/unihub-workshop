# Spec: Notification Dispatch System

**Capability:** `notification-dispatch`
**Covers:** FR-F08-001, FR-F08-002
**Module:** `background`

## ADDED Requirements

### Requirement: Enqueue Notification Event to Message Queue

**ID:** FR-F08-001
**Priority:** MUST
**Classification:** FULLY AUTOMATED

When business events occur (registration confirmed, payment success, workshop cancelled, etc.), the system SHALL enqueue a notification job to the BullMQ `notification` queue immediately without waiting for the actual delivery result. This ensures the main request path is never blocked by external service latency (SMTP, Telegram API).

#### Scenario: Payment success triggers notification enqueue

- **GIVEN** a payment webhook is processed and registration is CONFIRMED
- **WHEN** the webhook handler enqueues a `PAYMENT_SUCCESS` notification event
- **THEN** the HTTP response returns immediately without waiting for email delivery
- **AND** the job is placed in the `notification` BullMQ queue for async processing

#### Scenario: Workshop cancellation broadcasts to all confirmed students

- **GIVEN** an organizer cancels a workshop with 50 CONFIRMED registrations
- **WHEN** the cancel workflow enqueues 50 `WORKSHOP_CANCELLED` notification jobs
- **THEN** all jobs are placed in the queue within the same transaction boundary
- **AND** the cancel endpoint returns HTTP 200 without waiting for any dispatch

---

### Requirement: Dispatch Notification via Configured Channel

**ID:** FR-F08-002
**Priority:** MUST
**Classification:** FULLY AUTOMATED

The Notification Worker SHALL consume jobs from the `notification` queue, look up the active channel configuration, delegate delivery to the appropriate channel adapter, and record the outcome (SENT or FAILED) in `notification_logs`.

#### Scenario: Email notification delivered successfully

- **GIVEN** a job with `channel = EMAIL` and a recipient with an active EMAIL channel config
- **WHEN** the worker processes the job
- **THEN** the EmailChannel adapter is invoked
- **AND** `notification_logs.status` is updated to `SENT` with `sent_at = NOW()`

#### Scenario: Channel dispatch fails with retry

- **GIVEN** a job where the channel adapter returns a failure (e.g., SMTP timeout)
- **WHEN** the worker processes the job and the channel fails
- **THEN** `notification_logs.status` is updated to `FAILED` with an error message
- **AND** BullMQ retries the job with exponential backoff (5s, 10s, 20s, 40s, 80s) up to 5 attempts

#### Scenario: Channel config is inactive

- **GIVEN** a job with `channel = TELEGRAM` but the TELEGRAM config has `is_active = false`
- **WHEN** the worker processes the job
- **THEN** `notification_logs.status` is updated to `FAILED` with reason "Channel is inactive"
- **AND** the job is NOT retried (terminal failure)

#### Scenario: Unknown channel type

- **GIVEN** a job with a channel type that has no registered adapter
- **WHEN** the dispatch service attempts to resolve the channel
- **THEN** `notification_logs.status` is updated to `FAILED`
- **AND** the job is NOT retried

---

### Requirement: Admin Query Notification Logs

**ID:** FR-F08-003
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

Organizers SHALL be able to view paginated notification delivery history with filtering by status, channel type, notification type, user, and workshop.

#### Scenario: List all failed notifications

- **GIVEN** an organizer with valid JWT
- **WHEN** `GET /admin/notifications/logs?status=FAILED&page=1&limit=20`
- **THEN** a paginated list of FAILED notification logs is returned
- **AND** each log includes notification_id, type, channel, recipient, status, error_message, created_at

#### Scenario: View single notification detail

- **GIVEN** an organizer with valid JWT
- **WHEN** `GET /admin/notifications/logs/:id`
- **THEN** the full notification log with payload is returned
- **AND** the response includes the complete `payload` JSON

---

### Requirement: Admin Manage Channel Configurations

**ID:** FR-F08-004
**Priority:** MUST
**Classification:** SYSTEM-SUPPORTED
**Actor:** ORGANIZER

Organizers SHALL be able to view and update notification channel configurations (enable/disable, provider settings).

#### Scenario: List all channel configurations

- **GIVEN** an organizer with valid JWT
- **WHEN** `GET /admin/notifications/channels`
- **THEN** all channel configs are returned with `channel_type`, `is_active`, `config_json`, `updated_at`

#### Scenario: Update channel configuration

- **GIVEN** an organizer with valid JWT
- **WHEN** `PATCH /admin/notifications/channels/EMAIL` with `{ "is_active": false }`
- **THEN** the EMAIL channel config is updated
- **AND** subsequent dispatch attempts for EMAIL will fail with "Channel is inactive"

---

### Requirement: Extensible Channel Architecture

**ID:** FR-F08-005
**Priority:** SHOULD
**Classification:** Architecture

The notification dispatch system SHALL use a Strategy pattern where each delivery channel is an independent `@Injectable()` class implementing `INotificationChannel`. Adding a new channel type SHALL require only a new channel class file plus one registry entry line — no existing channel code is modified.

#### Scenario: Add a new SMS channel

- **GIVEN** the system currently supports EMAIL, TELEGRAM, and APP channels
- **WHEN** a developer adds `SmsChannel` implementing `INotificationChannel` and registers it
- **THEN** no existing channel files are modified
- **AND** the dispatch service resolves SMS jobs to the new adapter without code changes
