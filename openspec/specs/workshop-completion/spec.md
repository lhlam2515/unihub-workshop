# Workshop Completion

Purpose: Automatically transition PUBLISHED workshops whose scheduled end time has passed to COMPLETED status, completing the workshop lifecycle.

## ADDED Requirements

### Requirement: System auto-completes past PUBLISHED workshops

The system SHALL periodically scan for PUBLISHED workshops whose `ends_at` is in the past and transition them to COMPLETED status. The transition SHALL be idempotent — workshops already in CANCELLED, DRAFT, or COMPLETED status are not affected.

#### Scenario: Workshop past its end time is completed
- **WHEN** the completion cron job fires and a PUBLISHED workshop has `ends_at < now()`
- **THEN** the workshop's status transitions to COMPLETED; the Redis seat counter key `seat:available:{workshopId}` is NOT deleted (COMPLETED is a terminal display state, not a cancellation)

#### Scenario: Multiple eligible workshops
- **WHEN** the completion cron job fires and 5 PUBLISHED workshops have `ends_at < now()`
- **THEN** all 5 workshops transition to COMPLETED in a single batch; the service returns `OkResult(5)`

#### Scenario: No eligible workshops
- **WHEN** the completion cron job fires and no PUBLISHED workshops are past their end time
- **THEN** the service returns `OkResult(0)` — a successful no-op

#### Scenario: Workshop is DRAFT or CANCELLED
- **WHEN** the completion cron job fires and a non-PUBLISHED workshop (DRAFT, CANCELLED, already COMPLETED) has `ends_at < now()`
- **THEN** the workshop is excluded by the WHERE clause; its status is unchanged

#### Scenario: Database error during transition
- **WHEN** the completion query fails due to a database connection error
- **THEN** the service returns `FailResult(INTERNAL_ERROR)`; the cron logs the error and retries on the next scheduled tick

### Requirement: Completion runs on a fixed schedule

The system SHALL execute the completion check on a cron schedule using `@nestjs/schedule`. The default interval SHALL be every hour (`0 * * * *`).

#### Scenario: Cron triggers hourly
- **WHEN** the system clock reaches the top of the hour
- **THEN** `completePastWorkshops()` is invoked automatically by the NestJS scheduler

#### Scenario: Manual trigger (future)
- **WHEN** an admin action or background job triggers completion manually
- **THEN** `completePastWorkshops()` can be called directly and returns the count of completed workshops
