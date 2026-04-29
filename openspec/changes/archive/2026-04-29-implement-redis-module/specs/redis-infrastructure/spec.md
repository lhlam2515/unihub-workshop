## ADDED Requirements

### Requirement: RedisService initializes on application startup

The system SHALL initialize an `ioredis` client connection during the NestJS `onModuleInit` lifecycle hook, reading the connection URL from the `REDIS_URL` environment variable. If the Redis server is unreachable, the application MUST fail to start.

#### Scenario: Successful connection

- **WHEN** the NestJS application starts and `REDIS_URL` points to an available Redis instance
- **THEN** `RedisService.onModuleInit()` creates an `ioredis` client and the application starts normally

#### Scenario: Redis unreachable

- **WHEN** the NestJS application starts and the Redis server at `REDIS_URL` is unreachable
- **THEN** the application fails to start with a connection error

### Requirement: RedisService provides primitive String operations

The system SHALL expose `get`, `set`, `setNx`, and `del` methods that delegate to the corresponding `ioredis` commands, preserving the native return types of each command.

#### Scenario: Get existing key

- **WHEN** `get("mykey")` is called and the key exists in Redis with value `"hello"`
- **THEN** the method returns `"hello"`

#### Scenario: Get missing key

- **WHEN** `get("nonexistent")` is called and the key does not exist in Redis
- **THEN** the method returns `null`

#### Scenario: Set key without expiry

- **WHEN** `set("mykey", "value")` is called without `exSeconds`
- **THEN** the key is stored in Redis with no TTL and the method returns `"OK"`

#### Scenario: Set key with expiry

- **WHEN** `set("mykey", "value", 60)` is called with `exSeconds = 60`
- **THEN** the key is stored in Redis with a 60-second TTL and the method returns `"OK"`

#### Scenario: Set NX when key does not exist

- **WHEN** `setNx("lock", "payload", 900)` is called and `lock` does not exist in Redis
- **THEN** the key is created with value `"payload"`, a 900-second TTL, and the method returns `true`

#### Scenario: Set NX when key already exists

- **WHEN** `setNx("lock", "payload")` is called and `lock` already exists in Redis
- **THEN** the method returns `false` without modifying the existing key

#### Scenario: Delete existing key

- **WHEN** `del("mykey")` is called and the key exists in Redis
- **THEN** the key is removed and the method returns `1`

#### Scenario: Delete missing key

- **WHEN** `del("nonexistent")` is called and the key does not exist
- **THEN** the method returns `0`

### Requirement: RedisService provides atomic Counter operations

The system SHALL expose `incr` and `decr` methods that atomically increment and decrement integer values stored at Redis keys. Both operations MUST be atomic to support concurrent access.

#### Scenario: Increment counter

- **WHEN** `incr("counter")` is called and the key holds value `5`
- **THEN** the key is atomically incremented to `6` and the method returns `6`

#### Scenario: Decrement counter

- **WHEN** `decr("counter")` is called and the key holds value `3`
- **THEN** the key is atomically decremented to `2` and the method returns `2`

#### Scenario: Increment non-existent key

- **WHEN** `incr("newcounter")` is called and the key does not exist in Redis
- **THEN** Redis treats it as `0`, increments to `1`, and the method returns `1`

### Requirement: RedisService provides TTL management operations

The system SHALL expose `expire` and `ttl` methods for managing key time-to-live values.

#### Scenario: Set expiry on existing key

- **WHEN** `expire("mykey", 300)` is called and the key exists in Redis
- **THEN** the key's TTL is set to 300 seconds and the method returns `true`

#### Scenario: Set expiry on missing key

- **WHEN** `expire("nonexistent", 300)` is called and the key does not exist
- **THEN** the method returns `false`

#### Scenario: Get TTL of key with expiry

- **WHEN** `ttl("mykey")` is called and the key exists with a remaining TTL of 450 seconds
- **THEN** the method returns `450`

#### Scenario: Get TTL of missing key

- **WHEN** `ttl("nonexistent")` is called and the key does not exist
- **THEN** the method returns `-2`

### Requirement: RedisService provides Hash operations

The system SHALL expose `hGet`, `hSet`, and `hGetAll` methods for interacting with Redis Hash data structures.

#### Scenario: Get hash field

- **WHEN** `hGet("circuit:payment:momo", "state")` is called and the hash field exists with value `"CLOSED"`
- **THEN** the method returns `"CLOSED"`

#### Scenario: Get missing hash field

- **WHEN** `hGet("circuit:payment:momo", "nonexistent")` is called and the field does not exist
- **THEN** the method returns `null`

#### Scenario: Set hash field

- **WHEN** `hSet("circuit:payment:momo", "failure_count", "3")` is called
- **THEN** the hash field is set and the method returns `1`

#### Scenario: Get all hash fields

- **WHEN** `hGetAll("circuit:payment:momo")` is called and the hash has fields `{state: "CLOSED", failure_count: "0"}`
- **THEN** the method returns `{ state: "CLOSED", failure_count: "0" }`

### Requirement: RedisService provides JSON serialization helpers

The system SHALL expose `jsonGet<T>` and `jsonSet` convenience methods that automatically handle JSON serialization and deserialization, so consumers do not need to inline `JSON.parse`/`JSON.stringify`.

#### Scenario: Get and deserialize JSON value

- **WHEN** `jsonGet<{ student_id: string }>("seat:lock:ws1:reg1")` is called and the key stores `{"student_id":"stu1","amount":150000}`
- **THEN** the method returns the parsed object `{ student_id: "stu1", amount: 150000 }`

#### Scenario: Get missing JSON key

- **WHEN** `jsonGet("nonexistent")` is called and the key does not exist
- **THEN** the method returns `null`

#### Scenario: Set serialized JSON value

- **WHEN** `jsonSet("seat:lock:ws1:reg1", { student_id: "stu1", amount: 150000 }, 900)` is called
- **THEN** the object is JSON-stringified and stored with a 900-second TTL

### Requirement: RedisService performs graceful shutdown

The system SHALL close the `ioredis` connection during the NestJS `onModuleDestroy` lifecycle hook to prevent the Node.js process from hanging on SIGTERM.

#### Scenario: Graceful shutdown

- **WHEN** the NestJS application receives SIGTERM
- **THEN** `RedisService.onModuleDestroy()` calls `this.client.quit()` and the process exits cleanly

### Requirement: RedisModule is globally available to all feature modules

The `RedisModule` SHALL be decorated with `@Global()` and imported in `AppModule`, making `RedisService` injectable in any feature module without requiring explicit imports.

#### Scenario: Service injection in BookingModule

- **WHEN** `BookingModule` references `RedisService` in its constructor
- **THEN** NestJS resolves the dependency from the global `RedisModule` without `BookingModule` importing `RedisModule` explicitly

#### Scenario: Service injection in IamModule

- **WHEN** `IamModule` references `RedisService` in its constructor
- **THEN** NestJS resolves the dependency from the global `RedisModule` without `IamModule` importing `RedisModule` explicitly
