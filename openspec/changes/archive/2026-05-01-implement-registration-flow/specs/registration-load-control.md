# Registration Load Control Mechanics

Delta spec for the load control layer that protects the registration endpoint from traffic surges.

## Requirements

### REQ-RLM-001: Token Bucket Rate Limiter

**Source:** FR-F04-001, BR-016
**Priority:** MUST
**Classification:** FULLY AUTOMATED

Per-user rate limiting using the Token Bucket algorithm stored in Redis Hash `ratelimit:register:{userId}`.

**Configuration:**
- Capacity: 5 tokens
- Refill rate: 1 token per 10 seconds
- Key TTL: 300 seconds (idle cleanup)

**Behavior:**
- First request initializes bucket with 4 tokens (5 minus 1 consumed)
- Subsequent requests calculate refill based on elapsed time since `last_refill_at`
- If bucket has tokens, decrement and allow
- If bucket empty, return `RATE_LIMIT_EXCEEDED` with `retry_after` seconds

#### Scenario: Bucket has tokens

- **Given** Student has 3 tokens in bucket
- **When** Student sends 1 registration request
- **Then** Tokens decrease to 2, request proceeds to next stage

#### Scenario: Bucket exhausted

- **Given** Student has sent 5 requests in 10 seconds (bucket empty)
- **When** Student sends 6th request
- **Then** Return HTTP 429 with `{ error: "RATE_LIMIT_EXCEEDED", retry_after: <seconds> }`

#### Scenario: Bucket refills over time

- **Given** Student exhausted bucket 10 seconds ago
- **When** Student sends new request
- **Then** 1 token is refilled and consumed, request proceeds

### REQ-RLM-002: Global Rate Limiter

**Source:** FR-F04-001, BR-017
**Priority:** MUST
**Classification:** FULLY AUTOMATED

System-wide rate limiting using INCR + EXPIRE on `ratelimit:global:register`.

**Configuration:**
- Threshold: 500 requests per second
- Window: 1-second fixed window

**Behavior:**
- INCR the global counter on each registration attempt
- Set EXPIRE 1 on first request in each window
- If counter > 500, return `RATE_LIMIT_EXCEEDED`

#### Scenario: Under threshold

- **Given** Global counter is at 300
- **When** Request arrives
- **Then** Counter increments to 301, request proceeds

#### Scenario: Over threshold

- **Given** Global counter is at 500
- **When** Request arrives
- **Then** Return HTTP 429, request blocked

### REQ-RLM-003: Atomic Seat Decrement

**Source:** FR-F04-002, BR-018
**Priority:** MUST
**Classification:** FULLY AUTOMATED

Atomic DECR on `seat:available:{workshopId}` with automatic rollback when sold out.

**Behavior:**
- DECR the counter atomically
- If result >= 0: seat reserved, continue
- If result < 0: INCR rollback, return `SEAT_UNAVAILABLE`

#### Scenario: Seat available

- **Given** `seat:available:{wid}` = 5
- **When** DECR executes
- **Then** Counter becomes 4, request proceeds

#### Scenario: Last seat

- **Given** `seat:available:{wid}` = 1, 2 concurrent requests
- **When** Both DECR simultaneously
- **Then** One gets 0 (success), one gets -1 → INCR back to 0 → `SEAT_UNAVAILABLE`

#### Scenario: Sold out

- **Given** `seat:available:{wid}` = 0
- **When** DECR executes
- **Then** Returns -1 → INCR back to 0 → `SEAT_UNAVAILABLE`

### REQ-RLM-004: Seat Lock for Paid Workshops

**Source:** FR-F04-004, BR-021
**Priority:** MUST
**Classification:** FULLY AUTOMATED

Redis-based seat lock with 15-minute TTL for paid workshop registrations.

**Key:** `seat:lock:{workshopId}:{registrationId}`
**TTL:** 900 seconds

**Behavior:**
- `acquire()`: SET NX with JSON payload and 900s TTL
- `release()`: DEL key (idempotent)
- `check()`: Get TTL, return valid/expired

#### Scenario: Lock acquired

- **Given** Paid workshop registration created
- **When** `acquire()` called with registration ID
- **Then** Redis key `seat:lock:{wid}:{rid}` exists with TTL = 900

#### Scenario: Lock expired

- **Given** Seat lock TTL reached 0 (15 minutes passed)
- **When** `check()` called
- **Then** Returns `SEAT_LOCK_EXPIRED`

#### Scenario: Lock released

- **Given** Active seat lock
- **When** `release()` called (on cancel or payment)
- **Then** Redis key deleted, future `check()` returns expired
