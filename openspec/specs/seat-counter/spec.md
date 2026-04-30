# Seat Counter

Purpose: Redis-backed atomic seat availability counter for high-concurrency booking (12,000 CCU). Provides initialize, getAvailable (with DB fallback), and delete operations.

## ADDED Requirements

### Requirement: Seat counter initialized with workshop capacity
The system SHALL set a Redis key `seat:available:{workshopId}` to the workshop's capacity when the counter is initialized.

#### Scenario: Initialize counter
- **WHEN** SeatCounterService.initialize(workshopId, 50) is called
- **THEN** Redis SET `seat:available:{workshopId}` = 50 with no TTL

### Requirement: Get available seats from Redis with DB fallback
The system SHALL return available seat count from Redis. If the Redis key is missing, the system SHALL fall back to reading from the workshop_slots table (total_capacity - confirmed_count).

#### Scenario: Redis hit
- **WHEN** getAvailable(workshopId) is called and Redis key exists with value 45
- **THEN** returns 45

#### Scenario: Redis miss, DB fallback
- **WHEN** getAvailable(workshopId) is called and Redis key does not exist
- **THEN** system reads workshop_slots for the workshop, returns total_capacity - confirmed_count

#### Scenario: Both Redis and DB miss
- **WHEN** getAvailable(workshopId) is called and neither Redis key nor workshop_slots row exists
- **THEN** returns 0

### Requirement: Delete seat counter
The system SHALL delete the Redis key `seat:available:{workshopId}` when the counter is deleted (workshop cancelled).

#### Scenario: Delete existing counter
- **WHEN** SeatCounterService.delete(workshopId) is called and Redis key exists
- **THEN** Redis key `seat:available:{workshopId}` is deleted

#### Scenario: Delete non-existent counter
- **WHEN** SeatCounterService.delete(workshopId) is called and Redis key does not exist
- **THEN** no error — operation is idempotent
