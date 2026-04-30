## 1. Response DTO Builders

- [x] 1.1 Implement `WorkshopResponseBuilder.fromSummary()` — map workshop + speaker to WorkshopSummaryDto with camelCase→snake_case field conversion, nullish handling
- [x] 1.2 Implement `WorkshopResponseBuilder.fromDetail()` — extend fromSummary with description, room_name, ends_at
- [x] 1.3 Implement `WorkshopResponseBuilder.fromAdminDetail()` — extend fromDetail with confirmed_count, locked_count, created_by, status from workshop_slots join
- [x] 1.4 Implement `RoomResponseBuilder.from()` — map room entity to RoomResponseDto, parse facilities JSONB to string[]
- [x] 1.5 Implement `SpeakerResponseBuilder.from()` — map speaker entity to SpeakerResponseDto
- [x] 1.6 Implement `DocumentResponseBuilder.from()` — map workshop_documents entity to WorkshopDocumentResponseDto
- [x] 1.7 Implement `AiSummaryResponseBuilder.fromPublic()` — map ai_summaries to AiSummaryPublicDto (only expose summary_text when status=DONE)
- [x] 1.8 Implement `AiSummaryResponseBuilder.fromAdmin()` — extend fromPublic with summary_id, document_id, error_message

## 2. Repository Layer

- [x] 2.1 Implement `SpeakersRepository.findAll()` — SELECT all speakers ordered by full_name, wrap in tryCatch
- [x] 2.2 Implement `SpeakersRepository.findById(id)` — SELECT speaker by speaker_id, return Result<Speaker | null>
- [x] 2.3 Implement `SpeakersRepository.create(data: NewSpeaker)` — INSERT speaker, return Result<Speaker>
- [x] 2.4 Implement `RoomsRepository.findAll()` — SELECT all rooms ordered by name, wrap in tryCatch
- [x] 2.5 Implement `RoomsRepository.findById(id)` — SELECT room by room_id, return Result<Room | null>
- [x] 2.6 Implement `RoomsRepository.create(data: NewRoom)` — INSERT room, return Result<Room>
- [x] 2.7 Implement `RoomsRepository.findConflicting(roomId, startsAt, endsAt, excludeWorkshopId?)` — SELECT overlapping PUBLISHED workshops in same room
- [x] 2.8 Implement `WorkshopsRepository.create(data: NewWorkshop)` — INSERT workshop with DRAFT status, return Result<Workshop>
- [x] 2.9 Implement `WorkshopsRepository.findById(id)` — SELECT workshop with JOIN speaker and room
- [x] 2.10 Implement `WorkshopsRepository.findByIdAndStatus(id, status)` — SELECT workshop WHERE workshop_id = id AND status = status
- [x] 2.11 Implement `WorkshopsRepository.findPublished(filters)` — SELECT workshops WHERE status = PUBLISHED with optional date/is_paid filters, pagination (LIMIT/OFFSET + COUNT)
- [x] 2.12 Implement `WorkshopsRepository.listAdmin(filters)` — SELECT all workshops (any status) with optional status filter, pagination, JOIN slots for counts
- [x] 2.13 Implement `WorkshopsRepository.update(id, data: WorkshopUpdate)` — UPDATE workshop SET ... WHERE workshop_id = id, RETURNING *
- [x] 2.14 Implement `WorkshopsRepository.updateStatus(id, status)` — UPDATE workshops SET status WHERE workshop_id = id, RETURNING *
- [x] 2.15 Implement `WorkshopSlotsRepository.findByWorkshopId(workshopId)` — SELECT slot by workshop_id, return Result<WorkshopSlot | null>
- [x] 2.16 Implement `WorkshopSlotsRepository.create(data: NewWorkshopSlot)` — INSERT workshop_slots row
- [x] 2.17 Implement `WorkshopSlotsRepository.incrementConfirmed(workshopId)` — UPDATE confirmed_count + 1 (used by Booking)
- [x] 2.18 Implement `WorkshopSlotsRepository.decrementConfirmed(workshopId)` — UPDATE confirmed_count - 1 (used by Booking)
- [x] 2.19 Implement `WorkshopSlotsRepository.reconcile(workshopId, confirmedCount, lockedCount)` — UPDATE confirmed_count and locked_count to exact values (used by Background)
- [x] 2.20 Implement `WorkshopDocumentsRepository.findByWorkshopId(workshopId)` — SELECT documents WHERE workshop_id, ordered by uploaded_at DESC
- [x] 2.21 Implement `WorkshopDocumentsRepository.findById(documentId)` — SELECT document by document_id
- [x] 2.22 Implement `WorkshopDocumentsRepository.create(data)` — INSERT workshop_documents row
- [x] 2.23 Implement `WorkshopDocumentsRepository.updateStatus(documentId, status)` — UPDATE upload_status
- [x] 2.24 Implement `WorkshopDocumentsRepository.delete(documentId)` — DELETE document WHERE document_id
- [x] 2.25 Implement `AiSummariesRepository.findByDocumentId(documentId)` — SELECT summary by document_id, return Result<AiSummary | null>
- [x] 2.26 Implement `AiSummariesRepository.findByWorkshopId(workshopId)` — SELECT summaries WHERE workshop_id, ordered by created_at
- [x] 2.27 Implement `AiSummariesRepository.upsert(documentId, workshopId)` — INSERT ... ON CONFLICT (document_id) DO NOTHING for initial PENDING record
- [x] 2.28 Implement `AiSummariesRepository.updateStatus(summaryId, status, errorMessage?)` — UPDATE status, error_message, generated_at

## 3. Service Layer — Speakers & Rooms

- [x] 3.1 Implement `SpeakersService.listSpeakers()` — call repository, map via SpeakerResponseBuilder, return Result<SpeakerResponseDto[]>
- [x] 3.2 Implement `SpeakersService.createSpeaker(dto)` — call repository.create, map via SpeakerResponseBuilder, return Result<SpeakerResponseDto>
- [x] 3.3 Implement `RoomsService.listRooms()` — call repository, map via RoomResponseBuilder, return Result<RoomResponseDto[]>
- [x] 3.4 Implement `RoomsService.createRoom(dto)` — call repository.create, map via RoomResponseBuilder, return Result<RoomResponseDto>
- [x] 3.5 Implement `RoomConflictService.checkConflict(roomId, startsAt, endsAt, excludeWorkshopId?)` — call repository.findConflicting, if results found return FailResult with workshopErrors.roomConflict(), else OkResult(void)

## 4. Service Layer — Seat Counter

- [x] 4.1 Implement `SeatCounterService.initialize(workshopId, capacity)` — Redis SET `seat:available:{workshopId}` = capacity
- [x] 4.2 Implement `SeatCounterService.getAvailable(workshopId)` — Redis GET first, fallback to WorkshopSlotsRepository (total_capacity - confirmed_count), return number
- [x] 4.3 Implement `SeatCounterService.delete(workshopId)` — Redis DEL `seat:available:{workshopId}` (idempotent — no error if key missing)
- [x] 4.4 Add JSDoc for all SeatCounterService methods (business rules, Redis keys, fallback behavior)

## 5. Service Layer — Workshops (Core)

- [x] 5.1 Implement `WorkshopsService.createWorkshop(dto, userId)` — validate speaker and room existence, check room conflict, insert workshop + workshop_slots, return WorkshopAdminDetailDto
- [x] 5.2 Implement `WorkshopsService.updateWorkshop(id, dto)` — check status === DRAFT, validate speaker/room if changed, check room conflict if room/time changed, update, return WorkshopAdminDetailDto
- [x] 5.3 Implement `WorkshopsService.publishWorkshop(id)` — check status === DRAFT, update status to PUBLISHED, upsert workshop_slots (ensure row exists), initialize Redis seat counter, return WorkshopAdminDetailDto
- [x] 5.4 Implement `WorkshopsService.emergencyUpdate(id, dto)` — check status === PUBLISHED, check room conflict if room/time changed, update room/schedule fields, return WorkshopAdminDetailDto
- [x] 5.5 Implement `WorkshopsService.cancelWorkshop(id)` — check not already CANCELLED, update status to CANCELLED, delete Redis seat counter (if was PUBLISHED), document cross-module contract for Booking cascade, return WorkshopAdminDetailDto
- [x] 5.6 Implement `WorkshopsService.listPublished(query)` — validate and parse query, call repository.findPublished with filters and pagination, map each via fromSummary with Redis available seat count, return paginated result
- [x] 5.7 Implement `WorkshopsService.getPublicDetail(id)` — get workshop, verify status === PUBLISHED, get available seats from Redis, get AI summary (status DONE), map via fromDetail, return Result<WorkshopDetailDto>
- [x] 5.8 Implement `WorkshopsService.getAdminDetail(id)` — get workshop with slots join, map via fromAdminDetail, return Result<WorkshopAdminDetailDto>
- [x] 5.9 Implement `WorkshopsService.listAdmin(query)` — parse query, call repository.listAdmin, map each via fromAdminDetail, return paginated result
- [x] 5.10 Implement `WorkshopsService.getStats(id)` — get workshop, get slot counts, get Redis available, return stats object with confirmed_count, locked_count, available_seats, total_capacity

## 6. Service Layer — Documents & AI Summary

- [x] 6.1 Implement `DocumentsService.uploadDocument(workshopId, file, userId)` — verify workshop exists, generate file URL (stub: placeholder for object storage), insert document record, upsert AI summary with PENDING status, return WorkshopDocumentResponseDto
- [x] 6.2 Implement `DocumentsService.listDocuments(workshopId)` — call repository.findByWorkshopId, map via DocumentResponseBuilder, return array
- [x] 6.3 Implement `DocumentsService.deleteDocument(workshopId, documentId)` — verify document exists and belongs to workshop, delete (CASCADE removes ai_summaries), return void
- [x] 6.4 Implement `DocumentsService.getAiSummary(workshopId)` — call AiSummariesRepository.findByWorkshopId, map via AiSummaryResponseBuilder
- [x] 6.5 Implement `DocumentsService.retryAiSummary(documentId)` — verify summary exists and status = FAILED, update status to PENDING, return void

## 7. Controller Layer — Public

- [x] 7.1 Implement `WorkshopsPublicController.listPublished()` — parse query with ListWorkshopsQuerySchema, call workshopsService.listPublished, return Result
- [x] 7.2 Implement `WorkshopsPublicController.getPublicDetail()` — call workshopsService.getPublicDetail(id), return Result

## 8. Controller Layer — Admin

- [x] 8.1 Implement `WorkshopsAdminController.listAdmin()` — parse query, call workshopsService.listAdmin, return Result
- [x] 8.2 Implement `WorkshopsAdminController.createWorkshop()` — parse body with CreateWorkshopSchema, extract userId from @CurrentUser(), call workshopsService.createWorkshop, return Result
- [x] 8.3 Implement `WorkshopsAdminController.getAdminDetail()` — call workshopsService.getAdminDetail(id), return Result
- [x] 8.4 Implement `WorkshopsAdminController.updateWorkshop()` — parse body with UpdateWorkshopSchema, call workshopsService.updateWorkshop, return Result
- [x] 8.5 Implement `WorkshopsAdminController.publishWorkshop()` — call workshopsService.publishWorkshop(id), return Result
- [x] 8.6 Implement `WorkshopsAdminController.emergencyUpdate()` — parse body with EmergencyUpdateWorkshopSchema, call workshopsService.emergencyUpdate, return Result
- [x] 8.7 Implement `WorkshopsAdminController.cancelWorkshop()` — call workshopsService.cancelWorkshop(id), return Result
- [x] 8.8 Implement `WorkshopsAdminController.getStats()` — call workshopsService.getStats(id), return Result
- [x] 8.9 Implement `RoomsAdminController.listRooms()` — call roomsService.listRooms, return Result
- [x] 8.10 Implement `RoomsAdminController.createRoom()` — parse body with CreateRoomSchema, call roomsService.createRoom, return Result
- [x] 8.11 Implement `SpeakersAdminController.listSpeakers()` — call speakersService.listSpeakers, return Result
- [x] 8.12 Implement `SpeakersAdminController.createSpeaker()` — parse body with CreateSpeakerSchema, call speakersService.createSpeaker, return Result
- [x] 8.13 Implement `DocumentsAdminController.uploadDocument()` — extract workshopId from params, file from body, userId from @CurrentUser(), call documentsService.uploadDocument, return Result
- [x] 8.14 Implement `DocumentsAdminController.listDocuments()` — call documentsService.listDocuments(workshopId), return Result
- [x] 8.15 Implement `DocumentsAdminController.deleteDocument()` — call documentsService.deleteDocument(workshopId, documentId), return Result
- [x] 8.16 Implement `DocumentsAdminController.getAiSummary()` — call documentsService.getAiSummary(workshopId), return Result
- [x] 8.17 Implement `DocumentsAdminController.retryAiSummary()` — call documentsService.retryAiSummary(documentId), return Result

## 9. Module Wiring & Verification

- [x] 9.1 Fix `WorkshopsAdminController` constructor — replace `any` type with properly typed `WorkshopsService` injection
- [x] 9.2 Fix `RoomsAdminController` constructor — inject `RoomsService` (currently stubbed)
- [x] 9.3 Fix `SpeakersAdminController` constructor — inject `SpeakersService` (currently stubbed)
- [x] 9.4 Fix `DocumentsAdminController` constructor — inject `DocumentsService` (currently stubbed)
- [x] 9.5 Add `CatalogModule` to `AppModule` imports in `apps/server/src/app.module.ts`
- [x] 9.6 Run `pnpm check-types` to verify no TypeScript errors
- [x] 9.7 Run `pnpm lint` and fix any newly introduced lint errors
- [x] 9.8 Run `pnpm build` to verify full compilation success
