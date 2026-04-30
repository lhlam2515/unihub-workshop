## Why

The Catalog module is the **Single Source of Truth** for all workshop-related data in UniHub. Without it, no other module can function: Booking cannot register students (needs workshop existence + seat counters), Checkin cannot validate QR codes (needs workshop status), and Background cannot reconcile data. The database schemas, types, error factories, and DTOs are already defined — the business logic needs to be wired up to complete the core data backbone of the system.

## What Changes

- Implement 6 services: `WorkshopsService`, `SeatCounterService`, `RoomConflictService`, `RoomsService`, `SpeakersService`, `DocumentsService`
- Implement 6 repositories: workshops, workshop-slots, rooms, speakers, workshop-documents, ai-summaries
- Wire up 5 controllers: public workshop listing/detail, admin CRUD, room management, speaker management, document upload + AI summary
- Initialize Redis seat counter on workshop publish (`seat:available:{wid}`)
- Detect room scheduling conflicts via partial unique index + service-level check
- Integrate `CatalogModule` into `AppModule`
- Export `WorkshopsService` and `SeatCounterService` for cross-module consumption (Booking, Checkin, Background)

## Capabilities

### New Capabilities

- `workshop-crud`: Create, update, list, and view workshops with DRAFT/PUBLISHED/CANCELLED lifecycle
- `workshop-publishing`: Publish a workshop (DRAFT → PUBLISHED), initialize Redis seat counter, create workshop_slot record
- `workshop-cancel`: Cancel a workshop, mark all registrations as CANCELLED, void all tickets, delete Redis counter
- `workshop-emergency-update`: Update room/schedule on a PUBLISHED workshop with conflict detection
- `room-management`: CRUD for rooms with capacity validation and scheduling conflict detection
- `speaker-management`: CRUD for speakers with basic profile fields
- `seat-counter`: Redis-backed atomic seat availability counter (initialize, getAvailable with DB fallback, delete)
- `document-upload`: Upload PDF documents to object storage, trigger AI summary pipeline via job queue
- `ai-summary-tracking`: Track AI summary status (PENDING → PROCESSING → DONE/FAILED), expose summary to public

### Modified Capabilities

None — all capabilities are new. No existing specs require modification.

## Impact

- **Code**: `apps/server/src/modules/catalog/` — 29 files filled in from stubs (6 services, 6 repositories, 5 controllers, 11 DTOs)
- **AppModule**: Add `CatalogModule` to `apps/server/src/app.module.ts` imports
- **Dependencies**: No new packages required for core catalog. Document upload needs object storage client (deferred — stub with TODO). AI summary uses existing BullMQ infrastructure.
- **Database**: No schema changes needed — tables, indexes, checks already exist
- **Redis**: New keys `seat:available:{workshopId}` (counter) managed by `SeatCounterService`
- **Cross-module**: `BookingModule` and `CheckinModule` already expect `CatalogModule` exports — no changes needed on their side
