## Context

The mobile app (`apps/mobile`) calls the NestJS backend but its TypeScript interfaces were written in isolation from the server DTOs. Two service files contain type mismatches:

1. `features/auth/api/auth.service.ts` — `LoginCredentials.accountType` is typed as `"staff"` (lowercase), but the server `LoginSchema` (`z.enum(["STUDENT", "STAFF"])`) rejects any value that isn't uppercase, returning a 400 Zod validation error.

2. `features/workshops/api/workshops.service.ts` — `WorkshopDetailDto` has three wrong fields:
   - `workshopId` (mobile) vs `id` (server `WorkshopSummaryDto`)
   - `availableSeats` (mobile) vs `seatsAvailable` (server)
   - `speakerName: string` / `roomName: string` (mobile, flat) vs `speaker: SpeakerResponseDto | null` / `room: RoomResponseDto | null` (server, nested objects)

The server's `WorkshopResponseBuilder.fromDetail()` is the authoritative shape. The OpenAPI spec agrees with the server on all points.

## Goals / Non-Goals

**Goals:**
- Align `LoginCredentials.accountType` with the server enum (`"STAFF"`)
- Align `WorkshopDetailDto` with `WorkshopDetailDto` from `apps/server/src/modules/catalog/dto/workshop-response.dto.ts`
- Update all mobile consumers (screens, widgets) of the changed field names so nothing breaks at runtime

**Non-Goals:**
- Changing the server — it is correct
- Changing the OpenAPI spec — it is correct
- Adding new mobile features or screens
- Fixing any other mobile/server mismatches not identified in this change

## Decisions

### Decision 1: Align mobile types to server, not flatten server types in mobile

**Chosen:** Update mobile `WorkshopDetailDto` to use nested `speaker` / `room` objects matching the server shape exactly.

**Alternative considered:** Keep flat fields on mobile, transform the response in the service layer (map `speaker.name` → `speakerName`).

**Rationale:** The transformation approach adds indirection and hides the real contract. If the server adds fields to `Speaker` or `Room` later, the mobile would silently discard them. Aligning types directly makes the contract visible and type-safe. The mobile screens only use `speakerName` and `roomName` today — they can be updated to read `speaker?.name` and `room?.name`.

### Decision 2: Type `accountType` as a const literal `"STAFF"`, not a union

**Chosen:** `accountType: "STAFF"` — the mobile app only ever logs in as staff, so the union `"STUDENT" | "STAFF"` is unnecessary here.

**Rationale:** Keeps the type narrow and intentional. The mobile app has no student login path.

## Risks / Trade-offs

- **Screen breakage during migration** — Any screen reading `workshop.speakerName`, `workshop.roomName`, `workshop.availableSeats`, or `workshop.workshopId` will break at compile time once the interface changes. This is intentional: TypeScript will surface all consumers that need updating.
  → Mitigation: fix all TS errors as part of this change before merging.

- **Runtime field `id` vs `workshopId`** — The server returns `id` at the top level. The mobile was using `workshopId`. If any navigation or SQLite logic passes the wrong field, QR preload and workshop dashboard routing will silently fail.
  → Mitigation: grep for all uses of `workshopId` on workshop detail objects and update to `id`.

## Migration Plan

No database migration or deployment coordination needed — this is a pure mobile TypeScript fix. Changes take effect on the next app build. No rollback strategy required; git revert is sufficient if needed.
