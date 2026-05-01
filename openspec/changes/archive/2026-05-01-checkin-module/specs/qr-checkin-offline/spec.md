## ADDED Requirements

### Requirement: Accept and idempotently persist offline check-in batch
The system SHALL accept a batch of offline check-in records from the mobile app (`POST /checkin/sync`), look up each `qr_token`, and insert into `checkin_records` with `source = OFFLINE_SYNC` using `ON CONFLICT DO NOTHING`. The response SHALL report counts of synced, skipped (duplicate), and conflicted records.

#### Scenario: Clean batch sync
- **WHEN** `POST /checkin/sync` is called with N items containing valid, non-duplicate `qr_token` values
- **THEN** N `checkin_records` are inserted with `source = OFFLINE_SYNC` and `synced_count = N`

#### Scenario: Duplicate items skipped
- **WHEN** `POST /checkin/sync` contains items for tickets already present in `checkin_records` for the same workshop
- **THEN** those items are skipped (`ON CONFLICT DO NOTHING`) and counted in `skipped_count`; no error is thrown

#### Scenario: Repeated sync is safe
- **WHEN** the same batch is submitted twice (e.g. mobile retries after network error)
- **THEN** the second submission results in `synced_count = 0`, `skipped_count = N`; no duplicate records are created

#### Scenario: VOID ticket in batch marked as conflict
- **WHEN** a batch item contains the `qr_token` of a ticket that was voided after the offline scan
- **THEN** that item is counted in `conflicts_count` and not inserted into `checkin_records`

#### Scenario: `timestamp` field accepts ISO string
- **WHEN** the mobile app sends `checked_in_at` as an ISO 8601 string (e.g. `"2026-04-30T10:00:00Z"`)
- **THEN** the Zod schema coerces it to a `Date` object without error
