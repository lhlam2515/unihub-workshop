# Proposal: catalog-internal-finalize

## Summary

Complete three remaining gaps in the Catalog module that are expected by screens.md but not yet implemented: automated COMPLETED status transition for past workshops, update endpoint for rooms, and update endpoint for speakers. Each fills a visibility gap between the current implementation and the UI screens that reference these features.

## Motivation

### 1. COMPLETED status transition (gap: screens.md + enum exists, no logic)
- **screens.md (SCR-W15):** Admin workshop list references all four statuses: "DRAFT, PUBLISHED, CANCELLED, COMPLETED"
- **screens.md (SCR-W16):** Admin detail shows a status timeline "DRAFT → PUBLISHED → COMPLETED/CANCELLED"
- **SRS (F02 module objective):** Lifecycle spans "DRAFT đến COMPLETED/CANCELLED"
- **Current state:** `workshop_status` enum includes COMPLETED but no code transitions a workshop to this state. Workshops that finished days/weeks ago remain PUBLISHED forever.

### 2. Room update (gap: screens.md shows edit form, API only has create/list)
- **screens.md (SCR-W21):** Room form at `/admin/rooms/[roomId]/edit` — edit mode
- **screens.md (SCR-W20):** Room list shows "Sửa" (edit) button per row
- **Current state:** `RoomsAdminController` has GET (list) and POST (create) only. No PUT/PATCH.

### 3. Speaker update (gap: screens.md shows edit form, API only has create/list)
- **screens.md (SCR-W23):** Speaker form at `/admin/speakers/[speakerId]/edit` — edit mode
- **screens.md (SCR-W22):** Speaker list shows "Sửa" (edit) button per row
- **Current state:** `SpeakersAdminController` has GET (list) and POST (create) only. No PUT/PATCH.

## Scope

### In-scope
1. **COMPLETED status cron** — Add `completePastWorkshops()` to `WorkshopsService`, triggered by `@Cron` using `@nestjs/schedule`. Finds PUBLISHED workshops where `ends_at < now()` and transitions them to COMPLETED.
2. **Room update** — `PUT /admin/rooms/:id` endpoint, `UpdateRoomDto` (all fields optional), `updateRoom()` in service and repository.
3. **Speaker update** — `PUT /admin/speakers/:id` endpoint, `UpdateSpeakerDto` (all fields optional), `updateSpeaker()` in service and repository.
4. **Delta specs** for the affected capability specs.

### Out-of-scope (deferred)
- Room/Speaker delete — not required by screens.md or any spec
- Cross-module integration (BullMQ, Booking cascade, AI pipeline) — Priority 1, blocked
- Unit tests — Priority 3
- Document upload — already completed in `2026-05-01-catalog-object-storage`

## Impact

| Area | Change |
|------|--------|
| `catalog/services/workshops.service.ts` | Add `completePastWorkshops()` |
| `catalog/repositories/workshops.repository.ts` | Add `findPastPublished()` query |
| `catalog/services/rooms.service.ts` | Add `updateRoom()` |
| `catalog/repositories/rooms.repository.ts` | Add `update()` method |
| `catalog/dto/` | New: `update-room.dto.ts`, `update-speaker.dto.ts` |
| `catalog/controllers/rooms-admin.controller.ts` | Add `PUT /:id` |
| `catalog/services/speakers.service.ts` | Add `updateSpeaker()` |
| `catalog/repositories/speakers.repository.ts` | Add `update()` method |
| `catalog/controllers/speakers-admin.controller.ts` | Add `PUT /:id` |
| `catalog/catalog.module.ts` | Register `ScheduleModule` (or use app-level import) |
| `openspec/specs/` | Delta: `workshop-completion` (new), `room-management`, `speaker-management` |

## Dependencies

- `@nestjs/schedule` is already installed (v6.1.3) — no new packages needed
- No cross-module dependencies
- Independent of Background, Booking, and other modules
