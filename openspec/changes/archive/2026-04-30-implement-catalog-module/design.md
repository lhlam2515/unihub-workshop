## Context

The Catalog module skeleton exists with 29 files (5 controllers, 6 services, 6 repositories, 11 DTOs) but all business logic is TODO stubs. The database schema (`speakers`, `rooms`, `workshops`, `workshop_slots`, `workshop_documents`, `ai_summaries`) is fully defined with Drizzle ORM, including constraints, indexes, and the partial unique index for room conflict detection. Error factories (`workshopErrors`, `seatErrors`) and inferred types (`Workshop`, `NewWorkshop`, etc.) are ready.

The IAM module serves as the reference implementation — same Result pattern, same layer structure, same injection tokens.

**Constraints:**
- Follow IAM module patterns exactly (Result<T>, tryCatch, thin controllers)
- ESLint boundaries enforce Service-to-Service cross-module communication
- No new npm dependencies for core catalog (document upload deferred)
- No test files (per user directive)

## Goals / Non-Goals

**Goals:**
- Implement all 6 services with full business logic
- Implement all 6 repositories wrapping Drizzle calls with `tryCatch`
- Wire up all 5 controllers with guards, Zod validation, thin handlers
- Implement Redis seat counter with DB fallback pattern
- Implement room conflict detection using the existing partial unique index + service-level pre-check
- Wire `CatalogModule` into `AppModule`
- Document all public methods with Contract-Oriented JSDoc

**Non-Goals:**
- Actual object storage integration (S3/MinIO) — stub the upload, emit queue job for AI summary
- AI summary processing — that's the Background module's responsibility
- Cross-module cascade logic (voiding tickets on cancel) — Catalog only updates its own state; cross-module effects are documented interfaces
- Test files
- Web/mobile frontend

## Decisions

### 1. Layered Implementation Order (Bottom-Up)

**Decision:** Implement DTOs → Repositories → Services → Controllers → Module wiring.

**Rationale:** Enforces the dependency direction. Repositories need DTOs for type safety. Services need Repositories to orchestrate. Controllers need Services. This matches the existing IAM module pattern and the project's documented workflow.

### 2. Seat Counter: Redis-First with PostgreSQL Fallback

**Decision:** `SeatCounterService.getAvailable()` reads Redis first, falls back to PostgreSQL `workshop_slots` table. `initialize()` writes to Redis only (no DB write — that's handled by publish flow). `delete()` removes the Redis key.

**Rationale:** Redis is the source of truth for real-time seat counts (12,000 CCU booking requirement). But Redis can lose keys (restart, eviction). The DB fallback ensures the system degrades gracefully — the reconciliation cron will eventually repair any drift. This matches the Hybrid Storage strategy in `docs/blueprint/design/02-storage-strategy.md`.

**Redis keys:**
| Key | Purpose | Set By | TTL |
|-----|---------|--------|-----|
| `seat:available:{workshopId}` | Available seat counter | `initialize()` on publish | None (persists until cancel) |

### 3. Room Conflict Detection: Two-Layer Defense

**Decision:** Layer 1 — `RoomConflictService.checkConflict()` does a programmatic pre-check querying for overlapping time ranges on the same room. Layer 2 — The database's `uq_workshops_room_time_slot` partial unique index (WHERE status = 'PUBLISHED') catches any race condition at the DB level.

**Rationale:** The pre-check gives a clean user-facing error (`WORKSHOP_TIME_CONFLICT`). The DB index is the safety net for concurrent publishes. Two layers are cheaper than explicit locking for this read-often, write-rarely use case.

**Overlap detection query:** `WHERE room_id = $1 AND starts_at < $3 AND ends_at > $2 AND status = 'PUBLISHED'`

### 4. Workshop Lifecycle: Status Machine

**Decision:** Workshops follow a strict status machine:
```
DRAFT → PUBLISHED (via publish)
DRAFT → CANCELLED (via cancel)
PUBLISHED → CANCELLED (via cancel, cascades to registrations)
PUBLISHED → PUBLISHED (via emergency update — room/schedule only)
```

**Rationale:** Simple, predictable. No transitions back (can't "unpublish" or "uncancel"). This prevents the scheduling and capacity drift that would occur if a PUBLISHED workshop could return to DRAFT.

### 5. Publish Flow: Slot Initialization

**Decision:** Publishing a workshop does three things atomically (within a service method, not a DB transaction):
1. Update `workshops.status` → `PUBLISHED`
2. Insert `workshop_slots` row (`total_capacity = workshop.capacity`, `locked_count = 0`, `confirmed_count = 0`)
3. Redis `SET seat:available:{id} {capacity}`

**Rationale:** The workshop_slots table is the DB-side ground truth for reconciliation. The Redis counter is the real-time operational state. Order matters: DB first, then Redis. If Redis SET fails, the slot is still tracked in DB and reconciliation will detect the drift.

### 6. Cancel Flow: Local State Only

**Decision:** `WorkshopsService.cancel()` updates workshop status to CANCELLED, deletes the Redis seat counter. It does NOT modify registrations or tickets directly — that's Booking module's responsibility.

**Rationale:** Modular monolith boundaries. Catalog owns workshop lifecycle, Booking owns registration lifecycle. The controller's TODO comment about "cascade void tickets" is architecturally wrong — Catalog calls `BookingService` (not BookingRepository). Since Booking module isn't implemented yet, the cancel flow documents the cross-module contract but only executes Catalog-side operations.

**Cross-module contract (for when Booking exists):**
```
WorkshopsService.cancel(id) →
  1. UPDATE workshops SET status = 'CANCELLED'  
  2. DEL seat:available:{id}
  3. [Future] this.bookingService.cancelByWorkshop(id) — void tickets
```

### 7. Controller DTO Validation

**Decision:** Controllers use raw Zod schemas (`.parse()`) for request validation, matching the IAM module pattern, NOT `createZodDto` from `nestjs-zod`.

**Rationale:** The IAM module uses `Schema.parse(body)` explicitly in controllers. Consistency with the existing pattern is more important than adopting `createZodDto`. The global `ZodValidationPipe` catches `ZodError` and maps to `VALIDATION_FAILED`.

### 8. Response DTOs: Builder Pattern

**Decision:** Each entity has a `ResponseBuilder` with `static from(entity)` factory methods that map DB camelCase fields to API snake_case fields, strip internal columns, and handle nullish values.

**Rationale:** Consistent with IAM module pattern. The `from()` factory is the single point where internal DB representation is translated to external API contract. No DB columns leak to clients.

## Risks / Trade-offs

- **Redis counter drift**: If Redis loses the key (restart, eviction policy), `getAvailable()` returns 0, preventing all registrations. → Mitigation: DB fallback in `getAvailable()` reads `workshop_slots.total_capacity - confirmed_count`. Reconciliation cron (Background module) will repair drift.
- **Race condition on publish**: Two admins publishing the same workshop simultaneously could double-initialize Redis. → Mitigation: Service checks current status before transitioning; DB's UNIQUE constraint on `workshop_slots.workshop_id` prevents duplicate slot rows.
- **Missing Booking module**: Cancel flow cannot cascade to registrations yet. → Mitigation: Document the contract clearly in code comments. The cancel still works (workshop status changes, Redis counter deleted). When Booking module exists, add the cross-module call.
- **No object storage**: Document upload stores a placeholder URL. → Mitigation: Explicitly stub with TODO. The rest of the pipeline (AI summary job queuing) is functional — just the actual file storage is deferred.
