import { API_ROUTES } from "@/constants/api-routes";
import { serverFetch } from "@/lib/api/server";
import type { PaginationMeta } from "@/lib/api/types";
import { Result } from "@/lib/result";
import type {
  WorkshopDetail,
  WorkshopFilters,
  WorkshopListItem,
} from "@/types/workshop";

/**
 * Paginated list result returned by server-side service functions.
 *
 * Mirrors `PaginatedResult<T>` from the client but is defined locally to
 * avoid importing browser-side client code into Server Components.
 */
export interface PaginatedItems<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Fetch paginated public workshop list from within a Server Component.
 *
 * Builds a `?status=OPEN&...` query string from the provided filters, then
 * delegates to `serverFetch` which calls the backend with `cache: "no-store"`.
 *
 * @param params - Optional filters (day, hasSeats, sort, q, cursor, limit).
 * @returns OkResult with items + pagination, or FailResult with ApiError.
 */
export async function listWorkshopsServer(
  params: WorkshopFilters = {}
): Promise<Result<PaginatedItems<WorkshopListItem>>> {
  const qs = new URLSearchParams();
  qs.set("status", "OPEN");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.set(key, String(value));
    }
  }

  return Result.fromPromise(
    serverFetch<{ data: WorkshopListItem[]; pagination?: PaginationMeta }>(
      `${API_ROUTES.WORKSHOPS.LIST}?${qs.toString()}`
    ).then((payload) => ({
      items: payload.data,
      pagination: payload.pagination ?? {
        limit: params.limit ?? 20,
        nextCursor: null,
        hasMore: false,
        total: null,
      },
    }))
  );
}

/**
 * Fetch full workshop detail from within a Server Component.
 *
 * Auth is not injected — returns public fields only. Pass an `accessToken` to
 * the underlying `serverFetch` call if authenticated context is needed.
 *
 * @param workshopId - UUID of the target workshop.
 * @returns OkResult with WorkshopDetail, or FailResult with ApiError.
 */
export async function getWorkshopDetailServer(
  workshopId: string
): Promise<Result<WorkshopDetail>> {
  return Result.fromPromise(
    serverFetch<WorkshopDetail>(API_ROUTES.WORKSHOPS.DETAIL(workshopId))
  );
}
