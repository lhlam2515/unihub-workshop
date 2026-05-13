## 1. Fix Login accountType Enum

- [x] 1.1 In `apps/mobile/src/features/auth/api/auth.service.ts`, change `LoginCredentials.accountType` type from `"staff"` to `"STAFF"`

## 2. Fix WorkshopDetailDto Shape

- [x] 2.1 In `apps/mobile/src/features/workshops/api/workshops.service.ts`, update `WorkshopDetailDto` interface: rename `workshopId` → `id`, rename `availableSeats` → `seatsAvailable`, replace flat `speakerName: string` with `speaker: { name: string; bio?: string | null } | null`, replace flat `roomName: string` with `room: { name: string; capacity?: number } | null`
- [x] 2.2 Remove the `isPaid` boolean field (server uses `price > 0` logic — no such field in `WorkshopSummaryDto`; if needed derive from `price`)

## 3. Fix Consumers of WorkshopDetailDto

- [x] 3.1 In `apps/mobile/src/components/WorkshopCard.tsx`, update field reads: `workshop.speakerName` → `workshop.speaker?.name`, `workshop.availableSeats` → `workshop.seatsAvailable`, `workshop.workshopId` → `workshop.id`
- [x] 3.2 In `apps/mobile/src/app/(tabs)/index.tsx`, update all references to `w.workshopId` / `workshop.workshopId` → `w.id` / `workshop.id`

## 4. Verify Types Compile

- [x] 4.1 Run `pnpm check-types --filter=mobile` and fix any remaining TypeScript errors caused by the interface changes
