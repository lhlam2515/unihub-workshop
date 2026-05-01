## Why

The check-in module is a core operational piece of UniHub — without it, workshop attendance cannot be recorded. Check-in staff need a reliable mobile experience that works even in venues with poor WiFi, and the backend needs to handle both real-time scans and batched offline syncs without producing duplicate records.

## What Changes

- Implement `TicketService`: issue and void tickets tied to confirmed registrations, expose active tickets to students and check-in staff
- Implement `CheckinService`: validate QR tokens online and record check-ins with source tracking
- Implement `OfflineSyncService`: accept batched offline scans, persist idempotently via `INSERT ON CONFLICT DO NOTHING`
- Complete all repository methods (`TicketsRepository`, `CheckinRecordsRepository`) with Drizzle ORM queries
- Complete all DTOs: fix `OfflineSyncDto` timestamp coercion, fill response builders
- Wire controllers: inject typed services, replace `any` types with concrete DTOs
- Implement mobile Expo screens: pre-load tickets to SQLite, QR scanner (offline-first), sync flow

## Capabilities

### New Capabilities

- `ticket-lifecycle`: Issuing, voiding, and querying tickets linked to confirmed registrations
- `qr-checkin-online`: Real-time QR scan validation and check-in recording (source=ONLINE)
- `qr-checkin-offline`: Offline QR scan storage in mobile SQLite and idempotent batch sync to backend (source=OFFLINE_SYNC)
- `checkin-preload`: Staff pre-loading of active tickets for a workshop onto the mobile device before the event

### Modified Capabilities

## Impact

- **Backend**: `apps/server/src/modules/checkin/` — all services, repositories, controllers, DTOs
- **Mobile**: `apps/mobile/src/` — new screens for QR scanner, ticket preload, sync status; local SQLite schema for `offline_checkin_queue`
- **Cross-module**: `TicketService` is exported from `CheckinModule` and called by the booking module on registration confirmation and cancellation
- **Database**: `tickets`, `checkin_records`, `offline_checkin_queue` tables (schemas already defined)
- **Guards**: `WorkshopScopeGuard` already wired — no changes needed
