import { API_ROUTES } from "@/constants/api-routes";
import { api, type PaginatedResult } from "@/lib/api/client";
import type { RequestOptions } from "@/lib/api/types";
import { Result } from "@/lib/result";
import type { DashboardOverview } from "@/types/admin";
import type {
  AdminWorkshopFilters,
  RoomSummary,
  SpeakerSummary,
  WorkshopAdmin,
  WorkshopCancelRequest,
  WorkshopCreateRequest,
  WorkshopPatchRequest,
  WorkshopStats,
} from "@/types/workshop";

/** GET /admin/stats/overview — dashboard metrics, cached 5 min server-side. */
export async function getAdminDashboardOverview(): Promise<
  Result<DashboardOverview>
> {
  return Result.fromPromise(
    api.get<DashboardOverview>(API_ROUTES.ADMIN.STATS.OVERVIEW)
  );
}

/** GET paginated /admin/workshops — list all workshops with admin filters. */
export async function listAdminWorkshops(
  filters: AdminWorkshopFilters = {}
): Promise<Result<PaginatedResult<WorkshopAdmin>>> {
  return Result.fromPromise(
    api.getPaginated<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.LIST, {
      params: { ...filters } as Record<string, string>,
    })
  );
}

/** GET /admin/workshops/{id} — single workshop detail with version. */
export async function getAdminWorkshop(
  id: string
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    api.get<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.DETAIL(id))
  );
}

/** POST /admin/workshops — create a new workshop (default status DRAFT). */
export async function createWorkshop(
  body: WorkshopCreateRequest
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    api.post<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.CREATE, body)
  );
}

/** PATCH /admin/workshops/{id} — update workshop with optimistic locking. */
export async function updateWorkshop(
  id: string,
  body: WorkshopPatchRequest,
  version: number
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    api.patch<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.UPDATE(id), body, {
      headers: { "If-Match": `"${version}"` } as Record<string, string>,
    } as RequestOptions)
  );
}

/** POST /admin/workshops/{id}/publish — publish a draft workshop. */
export async function publishWorkshop(
  id: string,
  version: number
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    api.post<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.PUBLISH(id), undefined, {
      headers: { "If-Match": `"${version}"` } as Record<string, string>,
    } as RequestOptions)
  );
}

/** POST /admin/workshops/{id}/cancel — cancel a workshop with reason. */
export async function cancelWorkshop(
  id: string,
  body: WorkshopCancelRequest,
  version: number
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    api.post<WorkshopAdmin>(API_ROUTES.ADMIN.WORKSHOPS.CANCEL(id), body, {
      headers: { "If-Match": `"${version}"` } as Record<string, string>,
    } as RequestOptions)
  );
}

/** GET /admin/workshops/{id}/stats — workshop-specific KPIs. */
export async function getWorkshopStats(
  id: string
): Promise<Result<WorkshopStats>> {
  return Result.fromPromise(
    api.get<WorkshopStats>(API_ROUTES.ADMIN.WORKSHOPS.STATS(id))
  );
}

/** GET paginated /admin/speakers — for form dropdowns. */
export async function listSpeakers(): Promise<
  Result<PaginatedResult<SpeakerSummary>>
> {
  return Result.fromPromise(
    api.getPaginated<SpeakerSummary>(API_ROUTES.ADMIN.SPEAKERS.LIST, {
      params: { limit: 200 },
    })
  );
}

/** GET paginated /admin/rooms — for form dropdowns. */
export async function listRooms(): Promise<
  Result<PaginatedResult<RoomSummary>>
> {
  return Result.fromPromise(
    api.getPaginated<RoomSummary>(API_ROUTES.ADMIN.ROOMS.LIST, {
      params: { limit: 200 },
    })
  );
}
