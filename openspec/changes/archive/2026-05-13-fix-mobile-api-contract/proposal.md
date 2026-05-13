## Why

The mobile app's API service layer contains field name and enum value mismatches against the actual server responses, meaning login always fails (`"staff"` vs `"STAFF"`) and workshop detail screens render broken data (`availableSeats` vs `seatsAvailable`, flat strings vs nested objects). These bugs were introduced when the mobile services were written without cross-referencing the server DTOs or OpenAPI spec.

## What Changes

- Fix `accountType` value in mobile login: `"staff"` → `"STAFF"` to match server Zod enum
- Fix `WorkshopDetailDto` in mobile: rename `availableSeats` → `seatsAvailable`, replace flat `speakerName`/`roomName` strings with nested `speaker` and `room` objects matching server `WorkshopResponseBuilder` output
- Fix workshop ID field: rename `workshopId` → `id` to match server `WorkshopSummaryDto`

## Capabilities

### New Capabilities

_(none — this is a bug fix, no new capabilities)_

### Modified Capabilities

- `mobile-auth-flow`: `accountType` enum in login request must be uppercase `"STAFF"` (was lowercase `"staff"`)
- `mobile-workshop-list`: `WorkshopDetailDto` shape must match server `WorkshopDetailDto` — nested speaker/room objects, `seatsAvailable`, `id`

## Impact

- `apps/mobile/src/features/auth/api/auth.service.ts` — `LoginCredentials.accountType` type literal
- `apps/mobile/src/features/workshops/api/workshops.service.ts` — `WorkshopDetailDto` interface and any consumers
- Any mobile screens/components that destructure `WorkshopDetailDto` fields (`speakerName`, `roomName`, `availableSeats`, `workshopId`) need corresponding updates
