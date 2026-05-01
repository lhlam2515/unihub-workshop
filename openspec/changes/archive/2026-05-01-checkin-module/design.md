## Context

The check-in module scaffold exists (controllers, services, repositories, DTOs) but every method is a stub. The DB schema is fully defined: `tickets`, `checkin_records`, `offline_checkin_queue`. The `WorkshopScopeGuard` is already wired. The module imports `CatalogModule` (for workshop lookups) and `DatabaseModule`.

Two actor surfaces:
- **CHECKIN_STAFF** on mobile (Expo) — operates offline-first, syncs when online
- **STUDENT** on web — views their own QR tickets

## Goals / Non-Goals

**Goals:**
- Fill in all service/repository/DTO/controller stubs on the backend
- Implement the mobile Expo screens for the full check-in staff flow
- Ensure idempotent sync (no duplicate checkin_records regardless of how many times mobile syncs)
- IDOR protection on student ticket endpoints

**Non-Goals:**
- Payment flow (handled by booking module)
- Notification dispatch on check-in (handled by background module)
- Admin analytics view (separate web screen, different bounded context)
- Changing the DB schema

## Decisions

### 1. `qr_token` is a lookup key, not a signed JWT

The stubs say "decode qr_token to get ticket_id" — but the schema stores `qr_token` as a plain `varchar(255)` with a unique index (`idx_tickets_qr_token`). It carries no embedded data. Validation is a DB lookup, not a decode step.

**Chosen:** Generate `qr_token` as a `crypto.randomUUID()` at ticket issuance. Fast, unguessable, no signing overhead.

**Alternative considered:** Signed JWT as qr_token — would allow offline ticket validation without a DB hit, but the offline flow already uses SQLite preload, so it's unnecessary complexity.

### 2. Idempotency via DB unique constraint, not application-level dedup

`checkin_records` has `UNIQUE(ticket_id, workshop_id)`. The sync service does `INSERT ... ON CONFLICT DO NOTHING` via Drizzle's `.onConflictDoNothing()`. No Redis lock needed for sync.

**Rationale:** The constraint is the source of truth. Application-level dedup would be a redundant layer that could diverge.

### 3. Offline sync `timestamp` field: coerce string → Date in Zod

`OfflineSyncDto` uses `z.date()` which rejects ISO strings from JSON. Fix: use `z.coerce.date()` so mobile can send `"2026-04-30T10:00:00Z"` and it's coerced automatically.

### 4. `tickets` join strategy for workshop info

`tickets` has no `workshop_id` column — it links via `registration_id → registrations.workshop_id`. All queries needing workshop context (preload, student ticket view) must join `tickets → registrations → workshops`. Use Drizzle's relational query API (`db.query.tickets.findMany({ with: { registration: { with: { workshop: true } } } })`).

### 5. Mobile SQLite schema mirrors backend shape

The mobile `offline_checkin_queue` table (Expo SQLite + Drizzle) already defined in the CLAUDE.md architecture. On sync: read all `PENDING` rows, POST to `/checkin/sync`, mark rows `SYNCED` or `CONFLICT` based on response.

### 6. `TicketService.issueTicket` called by booking module

`TicketService` is exported from `CheckinModule`. The booking module calls `issueTicket(registrationId, workshopId)` after payment confirmation. `voidTicket(registrationId)` is called on cancellation. These are cross-module service-to-service calls — no direct repo access across modules.

## Risks / Trade-offs

- **Preload staleness** — Staff preloads tickets before the event. If a student cancels 10 minutes before, the mobile cache is stale. The offline scan accepts the VOID ticket locally; on sync, the server rejects it and marks `sync_status = CONFLICT`. Acceptable per spec (eventual consistency).

- **QR token exposure** — `qr_token` in API response is the raw scan target. If a student screenshots and shares it, someone else can check in. Out of scope to mitigate (no spec requirement for one-time tokens).

- **Large preload payloads** — A workshop with 500 attendees sends 500 ticket records on preload. No pagination in spec. Acceptable for now; worth flagging if capacity grows.

## Migration Plan

No schema migrations needed — tables already exist. Implementation is purely filling stubs. Deploy backend first, then mobile build.
