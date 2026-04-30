# Tasks: catalog-internal-finalize

## Task List

- [x] 1. Add new error codes and factories
- [x] 2. Add workshop completion repository logic
- [x] 3. Add workshop completion service with cron
- [x] 4. Add room update (DTO + repo + service + controller)
- [x] 5. Add speaker update (DTO + repo + service + controller)
- [x] 6. Wire ScheduleModule and verify build

---

## Task 1: Add new error codes and factories

**Files:**
- `apps/server/src/shared/response/types.ts` — add `ROOM_NOT_FOUND`, `SPEAKER_NOT_FOUND` to `ErrorCode`
- `apps/server/src/shared/response/errors.ts` — add `roomErrors`, `speakerErrors` factories

**Steps:**

### 1.1 Add ErrorCode entries
```typescript
| "ROOM_NOT_FOUND"
| "SPEAKER_NOT_FOUND"
```

### 1.2 Add error factories in errors.ts
```typescript
export const roomErrors = {
  notFound: (roomId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "ROOM_NOT_FOUND",
      message: `Room ${roomId} not found.`,
      context: { roomId },
    }),
} as const;

export const speakerErrors = {
  notFound: (speakerId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "SPEAKER_NOT_FOUND",
      message: `Speaker ${speakerId} not found.`,
      context: { speakerId },
    }),
} as const;
```

**Verification:** `pnpm check-types` passes for the shared package

---

## Task 2: Add workshop completion repository logic

**Files:**
- `apps/server/src/modules/catalog/repositories/workshops.repository.ts`

**Steps:**

### 2.1 Add `findPastPublished()` method
```typescript
async findPastPublished(): Promise<Result<Workshop[]>> {
  return tryCatch(
    async () => {
      const now = new Date();
      return this.db
        .select()
        .from(this.schema.workshops)
        .where(
          and(
            eq(this.schema.workshops.status, "PUBLISHED"),
            lt(this.schema.workshops.endsAt, now)
          )
        );
    },
    (err) => systemErrors.internal(err)
  );
}
```

### 2.2 Add `bulkUpdateStatus()` method
```typescript
async bulkUpdateStatus(ids: string[], status: WorkshopStatus): Promise<Result<number>> {
  return tryCatch(
    async () => {
      const result = await this.db
        .update(this.schema.workshops)
        .set({ status })
        .where(
          and(
            eq(this.schema.workshops.status, "PUBLISHED"),
            lt(this.schema.workshops.endsAt, new Date())
          )
        );
      return result.rowCount ?? 0;
    },
    (err) => systemErrors.internal(err)
  );
}
```

Note: The bulk update re-checks the WHERE (PUBLISHED + ends_at < now) to avoid TOCTOU. We don't use the IDs from step 1 — the UPDATE itself re-qualifies candidates.

Also add `lt` import from `drizzle-orm`.

**Verification:** `pnpm check-types` passes for server

---

## Task 3: Add workshop completion service with cron

**Files:**
- `apps/server/src/modules/catalog/services/workshops.service.ts`

**Steps:**

### 3.1 Add imports
```typescript
import { Cron } from "@nestjs/schedule";
```

### 3.2 Add `completePastWorkshops()` method
```typescript
/**
 * Cron job: auto-completes PUBLISHED workshops whose end time has passed.
 *
 * Business rules:
 * - Only PUBLISHED workshops with ends_at < now() are eligible.
 * - Transition is idempotent — already COMPLETED/CANCELLED workshops are excluded by the WHERE.
 * - Redis seat counter key is intentionally NOT deleted (COMPLETED is a display state, not cancel).
 *
 * Side effects:
 * - Updates workshop status to COMPLETED in bulk.
 * - Logs the number of workshops completed (or 0 if none eligible).
 *
 * @returns OkResult containing the count of completed workshops, or FailResult (INTERNAL_ERROR).
 */
@Cron("0 * * * *")
async completePastWorkshops(): Promise<Result<number>> {
  const result = await this.workshopsRepo.bulkUpdateStatus([], "COMPLETED");
  if (result.isFailure) return Result.fail(result.error);
  return Result.ok(result.data);
}
```

**Note:** The `bulkUpdateStatus` method handles its own WHERE clause internally, so we don't need to pass IDs. The `[]` is an empty array (unused by the bulk method). Actually, let the method take no params since it qualifies candidates internally.

Wait — the design doc says the repo should use `WHERE status = 'PUBLISHED' AND ends_at < NOW()` directly. Let's align: `bulkUpdateStatus` doesn't need IDs as input — it finds candidates internally. The method name should reflect this.

**Revised:** Method name `completePastPublished()` — self-contained. The `@Cron` just calls it.

### 3.3 Refine cron method
The cron fires, delegates to repo. No IDs needed. The cron catches errors internally via the Result pattern — failures are logged but don't crash the app.

**Verification:** `pnpm check-types` passes

---

## Task 4: Add room update (DTO + repo + service + controller)

**Files:**
- `apps/server/src/modules/catalog/dto/update-room.dto.ts` (NEW)
- `apps/server/src/modules/catalog/repositories/rooms.repository.ts`
- `apps/server/src/modules/catalog/services/rooms.service.ts`
- `apps/server/src/modules/catalog/controllers/rooms-admin.controller.ts`

**Steps:**

### 4.1 Create `UpdateRoomDto`
```typescript
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  building: z.string().optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive().optional(),
  floor_plan_url: z.string().url().optional(),
  facilities: z.array(z.string()).optional(),
});

export class UpdateRoomDto extends createZodDto(UpdateRoomSchema) {}
```

### 4.2 Add `update()` to RoomsRepository
```typescript
async update(id: string, data: Partial<NewRoom>): Promise<Result<Room>> {
  return tryCatch(
    async () => {
      const [result] = await this.db
        .update(this.schema.rooms)
        .set(data)
        .where(eq(this.schema.rooms.roomId, id))
        .returning();
      return result;
    },
    (err) => systemErrors.internal(err)
  );
}
```

### 4.3 Add `updateRoom()` to RoomsService
- Find room by ID → if not found, return `roomErrors.notFound(id)`
- Map DTO snake_case fields to camelCase for DB
- Handle facilities: convert string[] to JSONB record (same as create)
- Call `roomsRepo.update(id, data)`
- Return `RoomResponseBuilder.from(result)`

### 4.4 Add `PUT /:id` to RoomsAdminController
```typescript
@Put(":id")
async updateRoom(
  @Param("id") id: string,
  @Body() dto: UpdateRoomDto
) {
  return this.roomsService.updateRoom(id, dto);
}
```

Add `Put`, `Param` imports.

**Verification:** `pnpm check-types` passes

---

## Task 5: Add speaker update (DTO + repo + service + controller)

**Files:**
- `apps/server/src/modules/catalog/dto/update-speaker.dto.ts` (NEW)
- `apps/server/src/modules/catalog/repositories/speakers.repository.ts`
- `apps/server/src/modules/catalog/services/speakers.service.ts`
- `apps/server/src/modules/catalog/controllers/speakers-admin.controller.ts`

**Steps:**

### 5.1 Create `UpdateSpeakerDto`
```typescript
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const UpdateSpeakerSchema = z.object({
  full_name: z.string().min(1).optional(),
  title: z.string().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

export class UpdateSpeakerDto extends createZodDto(UpdateSpeakerSchema) {}
```

### 5.2 Add `update()` to SpeakersRepository
Same pattern as rooms: `update(id, data)` → UPDATE + RETURNING.

### 5.3 Add `updateSpeaker()` to SpeakersService
- Find speaker by ID → if not found, return `speakerErrors.notFound(id)`
- Map DTO fields to camelCase for DB
- Call `speakersRepo.update(id, data)`
- Return `SpeakerResponseBuilder.from(result)`

### 5.4 Add `PUT /:id` to SpeakersAdminController
Same pattern as rooms controller.

**Verification:** `pnpm check-types` passes

---

## Task 6: Wire ScheduleModule and verify build

**Files:**
- `apps/server/src/modules/catalog/catalog.module.ts`
- (Check if `ScheduleModule` is already imported in `AppModule`)

**Steps:**

### 6.1 Import ScheduleModule in CatalogModule
```typescript
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [DatabaseModule, RedisModule, ScheduleModule.forRoot()],
  // ...
})
```

**Note:** If `ScheduleModule.forRoot()` is already registered in `AppModule`, we don't need it here. Check `app.module.ts` first. If already imported, only add the import statement (no `.forRoot()`).

### 6.2 Build and lint verification
- `pnpm check-types` — no errors
- `pnpm lint --filter=server` — clean
- `pnpm build --filter=server` — succeeds

---

## Dependencies

```
Task 1 (error codes)
  ├─► Task 4 (room update)
  └─► Task 5 (speaker update)

Task 2 (workshop repo)
  └─► Task 3 (workshop service + cron)
       └─► Task 6 (ScheduleModule wiring)

Task 4, Task 5, Task 6 ── independent after deps satisfied
```

Execution order: 1 → (2 → 3) + (4 + 5) in parallel → 6
