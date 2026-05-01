## 1. Repositories

- [x] 1.1 Implement `TicketsRepository.create(data)` — insert ticket with `qr_token`, `registration_id`, `status=ACTIVE`
- [x] 1.2 Implement `TicketsRepository.findByQRToken(qrToken)` — query via `idx_tickets_qr_token`, join registrations for `workshop_id`
- [x] 1.3 Implement `TicketsRepository.findById(id)` — single ticket lookup with registration join
- [x] 1.4 Implement `TicketsRepository.findByStudentIdAndStatus(studentId, status)` — join registrations → workshops for response shape
- [x] 1.5 Implement `TicketsRepository.findByWorkshopIdAndStatus(workshopId, status)` — join registrations, filter by workshop
- [x] 1.6 Implement `TicketsRepository.updateStatus(id, status)` — set `status` and `voided_at` when voiding
- [x] 1.7 Implement `CheckinRecordsRepository.create(data)` — insert with `ON CONFLICT DO NOTHING`, return inserted or null
- [x] 1.8 Implement `CheckinRecordsRepository.findByWorkshopId(workshopId, limit?)` — ordered by `checked_in_at DESC`
- [x] 1.9 Implement `CheckinRecordsRepository.countByWorkshopId(workshopId)` — count for stats

## 2. DTOs

- [x] 2.1 Fix `OfflineSyncDto`: change `timestamp: z.date()` to `z.coerce.date()` for ISO string support
- [x] 2.2 Complete `TicketResponseBuilder.from()` — map ticket + workshop fields to response shape
- [x] 2.3 Complete `SyncResultBuilder.from()` — already correct, verify and fill
- [x] 2.4 Complete `CheckinStatusBuilder.from()` — map stats + recent check-ins array

## 3. Ticket Service

- [x] 3.1 Implement `TicketService.issueTicket(registrationId, workshopId)` — generate `crypto.randomUUID()` as `qr_token`, call `ticketsRepo.create()`
- [x] 3.2 Implement `TicketService.voidTicket(registrationId, tx?)` — find ticket by `registration_id`, call `updateStatus(id, 'VOID')`
- [x] 3.3 Implement `TicketService.getMyTickets(studentId)` — call `findByStudentIdAndStatus(studentId, 'ACTIVE')`, return `Result.ok()`
- [x] 3.4 Implement `TicketService.getTicketDetail(studentId, ticketId)` — `findById`, verify `registration.student_id === studentId`, return 404 if mismatch
- [x] 3.5 Implement `TicketService.preloadActiveTickets(workshopId)` — call `findByWorkshopIdAndStatus(workshopId, 'ACTIVE')`
- [x] 3.6 Inject `TicketsRepository` properly (replace `any` constructor param)

## 4. Checkin Service

- [x] 4.1 Inject `CheckinRecordsRepository` and `TicketsRepository` (replace `any` params)
- [x] 4.2 Implement `CheckinService.scanQR(qrToken, workshopId, staffUserId, deviceId?)`:
  - findByQRToken → 404 if not found
  - verify `status === ACTIVE` → error if VOID
  - verify ticket belongs to `workshopId` → error if mismatch
  - call `checkinRecordsRepo.create({ source: 'ONLINE', checked_in_by: staffUserId, ... })`
  - handle unique constraint violation → return duplicate error
- [x] 4.3 Implement `CheckinService.getWorkshopCheckinStatus(workshopId)`:
  - count confirmed registrations for workshop
  - call `countByWorkshopId` and `findByWorkshopId(workshopId, 20)`
  - return `CheckinStatusBuilder.from()`

## 5. Offline Sync Service

- [x] 5.1 Inject `CheckinRecordsRepository` and `TicketsRepository` (replace `any` params)
- [x] 5.2 Implement `OfflineSyncService.processSyncBatch(items, staffUserId, workshopId)`:
  - for each item: `findByQRToken` → skip if not found or VOID (conflict)
  - call `checkinRecordsRepo.create({ source: 'OFFLINE_SYNC', checked_in_at: item.timestamp, ... })` with `ON CONFLICT DO NOTHING`
  - track synced / skipped / conflicts counts
  - return `SyncResultBuilder.from(synced, skipped, conflicts)`

## 6. Controllers

- [x] 6.1 Wire `CheckinController` — inject `CheckinService` and `OfflineSyncService` with concrete types
- [x] 6.2 Implement `CheckinController.getWorkshopTickets` — call `ticketService.preloadActiveTickets(workshopId)`
- [x] 6.3 Implement `CheckinController.scanQR` — call `checkinService.scanQR(dto.qr_token, dto.workshop_id, user.id, dto.device_id)`
- [x] 6.4 Implement `CheckinController.syncOfflineData` — call `offlineSyncService.processSyncBatch(dto.items, user.id, workshopId)`
- [x] 6.5 Implement `CheckinController.getWorkshopStatus` — call `checkinService.getWorkshopCheckinStatus(workshopId)`
- [x] 6.6 Wire `TicketsController` — inject `TicketService` with concrete type
- [x] 6.7 Implement `TicketsController.getMyTickets` — call `ticketService.getMyTickets(user.id)`
- [x] 6.8 Implement `TicketsController.getMyTicket` — call `ticketService.getTicketDetail(user.id, ticketId)`

## 7. Mobile — SQLite Schema & Database

- [x] 7.1 Define Drizzle schema for `tickets` table in `apps/mobile/src/database/schema/` (mirror of backend: `ticket_id`, `qr_token`, `workshop_id`, `status`, `student_id`)
- [x] 7.2 Define Drizzle schema for `offline_checkin_queue` table (`local_id`, `qr_token`, `workshop_id`, `checked_in_at`, `device_id`, `sync_status`)
- [x] 7.3 Set up Drizzle + expo-sqlite client in `apps/mobile/src/database/`

## 8. Mobile — API Client

- [x] 8.1 Add `ticketsApi.preload(workshopId)` — `GET /checkin/workshops/:id/tickets`
- [x] 8.2 Add `checkinApi.scanOnline(qrToken, workshopId)` — `POST /checkin/scan`
- [x] 8.3 Add `checkinApi.syncOffline(items)` — `POST /checkin/sync`
- [x] 8.4 Add `ticketsApi.getMyTickets()` — `GET /students/me/tickets` (student-facing)

## 9. Mobile — Screens

- [x] 9.1 Implement preload screen — show workshop list, trigger `ticketsApi.preload()`, store results in SQLite
- [x] 9.2 Implement QR scanner screen — use camera to scan, look up `qr_token` in SQLite, show result instantly, queue to `offline_checkin_queue` if offline
- [x] 9.3 Implement online scan flow — if network available, call `checkinApi.scanOnline()` directly
- [x] 9.4 Implement sync screen — show pending count from `offline_checkin_queue`, trigger `checkinApi.syncOffline()`, update rows to `SYNCED`/`CONFLICT`
- [x] 9.5 Implement student ticket list screen — call `ticketsApi.getMyTickets()`, display QR code for each ticket
