# Design: catalog-internal-finalize

Architectural decisions for completing the remaining internal Catalog features: workshop completion cron, room update, and speaker update.

---

## 1. COMPLETED Status Transition

### 1.1 Scheduling mechanism

**Decision:** Use `@Cron` from `@nestjs/schedule` (already installed) directly in `WorkshopsService`, rather than creating a separate job service or importing Background module.

**Rationale:**
- `@nestjs/schedule` provides `ScheduleModule` and `@Cron()` decorator out of the box — no new dependencies
- The Background module's cron infrastructure (BullMQ) is not yet implemented; `@Cron` is a lightweight NestJS-native alternative that doesn't require Redis or queue workers
- The logic is simple (1 query + 1 status update per workshop) — no queue fan-out or worker distribution needed
- When the Background module is ready, this cron can be moved to a BullMQ repeatable job without changing the service method signature

**Cron expression:** `0 * * * *` (every hour at minute 0). Completion is not time-critical; a 1-hour delay between workshop end and status change is acceptable. If precision is needed later, reduce to `*/15 * * * *` (every 15 minutes).

**Module wiring:** `ScheduleModule.forRoot()` must be imported in `CatalogModule`. Since `@nestjs/schedule` is already installed, no package changes needed.

### 1.2 Repository: `findPastPublished()`

**Decision:** Add `completePastPublished()` to `WorkshopsRepository` — a single method that both finds and updates in one transaction-like operation (actually two queries: SELECT then UPDATE with IN).

**Rationale:**
- Finding and updating in the same method avoids TOCTOU races (another admin could cancel a workshop between the SELECT and UPDATE)
- Using `WHERE status = 'PUBLISHED' AND ends_at < NOW()` in both SELECT and UPDATE ensures only truly eligible workshops are transitioned
- Drizzle doesn't support `UPDATE ... WHERE ... RETURNING *` with complex subqueries easily, so we use two steps: SELECT for logging, then bulk UPDATE

**Query:**
```sql
-- Step 1: Identify candidates
SELECT * FROM workshops
WHERE status = 'PUBLISHED' AND ends_at < NOW()

-- Step 2: Bulk transition (returns count, not rows — idempotent)
UPDATE workshops SET status = 'COMPLETED'
WHERE status = 'PUBLISHED' AND ends_at < NOW()
```

### 1.3 Service: `completePastWorkshops()`

**Decision:** Single service method that calls the repo, processes results, and logs count. Returns `Result<number>` (count of workshops transitioned).

**Edge cases:**
- No workshops eligible → `OkResult(0)`, no error
- DB error → `FailResult(INTERNAL_ERROR)`
- Already COMPLETED workshops have `status != 'PUBLISHED'` so they're excluded by the WHERE clause — idempotent

**Side effects:** None (no notification needed for automated completion; students see COMPLETED status on their history views).

---

## 2. Room Update

### 2.1 HTTP method

**Decision:** `PUT /admin/rooms/:id` — consistent with workshop update which also uses PUT.

**Rationale:**
- The project convention is PUT for updates (see `WorkshopsAdminController.updateWorkshop()` at `PUT /admin/workshops/:id`)
- PUT implies idempotency: sending the same update twice produces the same result
- Even though our DTO is partial (all fields optional), PUT is the convention for this codebase

### 2.2 DTO design

**Decision:** `UpdateRoomSchema` with all fields optional (`.partial()`), same structure as `CreateRoomSchema` but every field wrapped in `.optional()`.

**Schema:**
```typescript
export const UpdateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  building: z.string().optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive().optional(),
  floor_plan_url: z.string().url().optional(),
  facilities: z.array(z.string()).optional(),
});
```

**Field mapping:** Snake_case in API → camelCase for DB, same as create. The `RoomResponseBuilder` already handles DB → API mapping.

### 2.3 Error handling

**Decision:** Add new `ROOM_NOT_FOUND` error code and `roomErrors` factory in `errors.ts`. Follows the same pattern as `workshopErrors.notFound()`.

**Scenarios:**
- Room not found → `FailResult(roomErrors.notFound(id))` → HTTP 404
- DB error → `FailResult(systemErrors.internal(err))` → HTTP 500
- Successful update → `OkResult(RoomResponseBuilder.from(updated))`

### 2.4 Repository: `update()`

**Decision:** Add `update(id: string, data: Partial<NewRoom>)` method following the same pattern as `WorkshopsRepository.update()`.

---

## 3. Speaker Update

### 3.1 Design follows Room Update

Identical pattern: PUT endpoint, partial DTO, `SPEAKER_NOT_FOUND` error, `update()` repo method.

**Schema:**
```typescript
export const UpdateSpeakerSchema = z.object({
  full_name: z.string().min(1).optional(),
  title: z.string().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
});
```

### 3.2 No cascade to workshops

Speaker update only affects the `speakers` table. Workshop records store `speaker_id` (UUID FK) — speaker name/title changes are reflected on read via the LEFT JOIN in workshop queries. No denormalization to fix up.

---

## 4. New Error Codes

Two new codes added to `ErrorCode` type:

| Code | Category | HTTP | Factory |
|------|---------|------|---------|
| `ROOM_NOT_FOUND` | NOT_FOUND | 404 | `roomErrors.notFound(id)` |
| `SPEAKER_NOT_FOUND` | NOT_FOUND | 404 | `speakerErrors.notFound(id)` |

---

## 5. Module Changes

### `CatalogModule`

Add `ScheduleModule.forRoot()` to imports. `@nestjs/schedule` is already in dependencies.

```typescript
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [DatabaseModule, RedisModule, ScheduleModule.forRoot()],
  // ... rest unchanged
})
```

---

## 6. Files Summary

| Action | File | Purpose |
|--------|------|---------|
| NEW | `dto/update-room.dto.ts` | `UpdateRoomDto` + `UpdateRoomSchema` |
| NEW | `dto/update-speaker.dto.ts` | `UpdateSpeakerDto` + `UpdateSpeakerSchema` |
| MODIFY | `repositories/workshops.repository.ts` | `completePastPublished()` method |
| MODIFY | `repositories/rooms.repository.ts` | `update()` method |
| MODIFY | `repositories/speakers.repository.ts` | `update()` method |
| MODIFY | `services/workshops.service.ts` | `completePastWorkshops()` with `@Cron` |
| MODIFY | `services/rooms.service.ts` | `updateRoom()` method |
| MODIFY | `services/speakers.service.ts` | `updateSpeaker()` method |
| MODIFY | `controllers/rooms-admin.controller.ts` | `PUT /:id` endpoint |
| MODIFY | `controllers/speakers-admin.controller.ts` | `PUT /:id` endpoint |
| MODIFY | `shared/response/types.ts` | `ROOM_NOT_FOUND`, `SPEAKER_NOT_FOUND` codes |
| MODIFY | `shared/response/errors.ts` | `roomErrors`, `speakerErrors` factories |
| MODIFY | `catalog.module.ts` | Import `ScheduleModule` |
