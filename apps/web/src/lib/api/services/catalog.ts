import { api, type PaginatedResult } from "@/lib/api/client";
import { Result } from "@/lib/result";
import type {
  WorkshopDetail,
  WorkshopListItem,
  WorkshopAvailability,
  WorkshopFilters,
} from "@/types/workshop";

/**
 * Fetch paginated workshop list with optional filters.
 *
 * Cached server-side (10s TTL via Redis cache-aside). Auth optional — when the
 * request includes a Bearer token each item carries an `isRegistered` flag.
 */
export async function listWorkshops(
  filters: WorkshopFilters = {}
): Promise<Result<PaginatedResult<WorkshopListItem>>> {
  return Result.fromPromise(
    api.getPaginated<WorkshopListItem>("/workshops", {
      params: {
        status: "OPEN",
        ...filters,
      } as Record<string, string | number | boolean | undefined>,
    })
  );
}

/**
 * Fetch full workshop detail including speaker bio, room floor plan and AI summary.
 *
 * Auth optional — returns `isRegistered` + `myRegistrationId` when authenticated.
 */
export async function getWorkshopDetail(
  workshopId: string
): Promise<Result<WorkshopDetail>> {
  return Result.fromPromise(
    api.get<WorkshopDetail>(`/workshops/${workshopId}`)
  );
}

/**
 * Lightweight endpoint hitting Redis directly — use for polling on the detail page.
 *
 * Cache TTL 10s. Bypasses DB entirely on cache hit.
 */
export async function getWorkshopAvailability(
  workshopId: string
): Promise<Result<WorkshopAvailability>> {
  return Result.fromPromise(
    api.get<WorkshopAvailability>(`/workshops/${workshopId}/availability`)
  );
}
