import { API_ROUTES } from "@/constants/api-routes";
import { api, type PaginatedResult } from "@/lib/api/client";
import { API_BASE_URL } from "@/lib/api/client/config";
import { tokenStore } from "@/lib/api/client/token-store";
import { ApiError } from "@/lib/api/errors";
import type { RequestOptions } from "@/lib/api/types";
import { Result } from "@/lib/result";
import type { DashboardOverview } from "@/types/admin";
import type { RegistrationAdmin } from "@/types/registration";
import type { AiSummary } from "@/types/workshop";
import type {
  AdminWorkshopFilters,
  RoomAdmin,
  RoomCreateRequest,
  RoomUpdateRequest,
  SpeakerAdmin,
  SpeakerCreateRequest,
  SpeakerUpdateRequest,
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

// ---------------------------------------------------------------------------
// Phase 7: Admin Master Data — Speakers CRUD
// ---------------------------------------------------------------------------

/** GET /admin/speakers — list all speakers. */
export async function listSpeakers(): Promise<Result<SpeakerAdmin[]>> {
  return Result.fromPromise(
    api.get<SpeakerAdmin[]>(API_ROUTES.ADMIN.SPEAKERS.LIST)
  );
}

/** GET /admin/speakers/{id} — single speaker detail. */
export async function getSpeaker(id: string): Promise<Result<SpeakerAdmin>> {
  return Result.fromPromise(
    api.get<SpeakerAdmin>(API_ROUTES.ADMIN.SPEAKERS.DETAIL(id))
  );
}

/** POST /admin/speakers — create a new speaker. */
export async function createSpeaker(
  body: SpeakerCreateRequest
): Promise<Result<SpeakerAdmin>> {
  return Result.fromPromise(
    api.post<SpeakerAdmin>(API_ROUTES.ADMIN.SPEAKERS.CREATE, body)
  );
}

/** PATCH /admin/speakers/{id} — update an existing speaker. */
export async function updateSpeaker(
  id: string,
  body: SpeakerUpdateRequest
): Promise<Result<SpeakerAdmin>> {
  return Result.fromPromise(
    api.patch<SpeakerAdmin>(API_ROUTES.ADMIN.SPEAKERS.UPDATE(id), body)
  );
}

/** DELETE /admin/speakers/{id} — delete a speaker (soft delete). */
export async function deleteSpeaker(id: string): Promise<Result<void>> {
  return Result.fromPromise(api.delete(API_ROUTES.ADMIN.SPEAKERS.DELETE(id)));
}

// ---------------------------------------------------------------------------
// Phase 7: Admin Master Data — Rooms CRUD
// ---------------------------------------------------------------------------

/** GET /admin/rooms — list all rooms. */
export async function listRooms(): Promise<Result<RoomAdmin[]>> {
  return Result.fromPromise(api.get<RoomAdmin[]>(API_ROUTES.ADMIN.ROOMS.LIST));
}

/** GET /admin/rooms/{id} — single room detail. */
export async function getRoom(id: string): Promise<Result<RoomAdmin>> {
  return Result.fromPromise(
    api.get<RoomAdmin>(API_ROUTES.ADMIN.ROOMS.DETAIL(id))
  );
}

/** POST /admin/rooms — create a new room. */
export async function createRoom(
  body: RoomCreateRequest
): Promise<Result<RoomAdmin>> {
  return Result.fromPromise(
    api.post<RoomAdmin>(API_ROUTES.ADMIN.ROOMS.CREATE, body)
  );
}

/** PATCH /admin/rooms/{id} — update an existing room. */
export async function updateRoom(
  id: string,
  body: RoomUpdateRequest
): Promise<Result<RoomAdmin>> {
  return Result.fromPromise(
    api.patch<RoomAdmin>(API_ROUTES.ADMIN.ROOMS.UPDATE(id), body)
  );
}

// ---------------------------------------------------------------------------
// Phase 6: Workshop Sub-screens
// ---------------------------------------------------------------------------

/** GET /admin/workshops/{id}/registrations — paginated registration list. */
export async function getWorkshopRegistrations(
  workshopId: string,
  params?: {
    status?: string;
    checkedIn?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<Result<PaginatedResult<RegistrationAdmin>>> {
  return Result.fromPromise(
    api.getPaginated<RegistrationAdmin>(
      API_ROUTES.ADMIN.WORKSHOPS.REGISTRATIONS(workshopId),
      { params: params as Record<string, string> }
    )
  );
}

/** GET /admin/workshops/{id}/summary — current AI summary state. */
export async function getAiSummary(
  workshopId: string
): Promise<Result<AiSummary>> {
  return Result.fromPromise(
    api.get<AiSummary>(API_ROUTES.ADMIN.WORKSHOPS.SUMMARY(workshopId))
  );
}

/** PUT /admin/workshops/{id}/summary — override summary text manually. */
export async function putSummary(
  workshopId: string,
  text: string
): Promise<Result<AiSummary>> {
  return Result.fromPromise(
    api.put<AiSummary>(API_ROUTES.ADMIN.WORKSHOPS.SUMMARY(workshopId), { text })
  );
}

/** POST /admin/workshops/{id}/summary/retry — retry AI summary generation. */
export async function retrySummary(
  workshopId: string
): Promise<Result<AiSummary>> {
  return Result.fromPromise(
    api.post<AiSummary>(API_ROUTES.ADMIN.WORKSHOPS.SUMMARY_RETRY(workshopId))
  );
}

/** POST /admin/workshops/{id}/summary (multipart) — upload PDF for AI processing.
 *  Uses raw fetch for multipart/form-data. */
export async function uploadSummaryPdf(
  workshopId: string,
  file: File
): Promise<Result<AiSummary>> {
  const formData = new FormData();
  formData.append("file", file);

  return Result.fromPromise(
    (async () => {
      const res = await fetch(
        `${API_BASE_URL}${API_ROUTES.ADMIN.WORKSHOPS.SUMMARY(workshopId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${tokenStore.get()}` },
          body: formData,
        }
      );
      if (!res.ok) {
        if (res.status === 413) {
          throw new ApiError(413, {
            code: "VALIDATION_FAILED",
            message: "File quá lớn. Kích thước tối đa là 10MB.",
          });
        }
        if (res.status === 415) {
          throw new ApiError(415, {
            code: "VALIDATION_FAILED",
            message: "Định dạng không được hỗ trợ. Chỉ chấp nhận file PDF.",
          });
        }
        const body = await res.json();
        throw new ApiError(res.status, body.error);
      }
      const body = await res.json();
      return body.data as AiSummary;
    })()
  );
}

/** GET /admin/stats/export?type=registrations — download registrations CSV. */
export async function downloadRegistrationsCSV(
  workshopId: string
): Promise<Result<void>> {
  return Result.fromPromise(
    (async () => {
      const url = `${API_BASE_URL}${API_ROUTES.ADMIN.STATS.EXPORT}?type=registrations&workshop_id=${encodeURIComponent(workshopId)}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${tokenStore.get()}`,
          Accept: "text/csv",
        },
      });
      if (!res.ok) {
        throw new ApiError(res.status, {
          code: "INTERNAL_ERROR",
          message: "Không thể tải xuống file CSV.",
        });
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `registrations-${workshopId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    })()
  );
}
