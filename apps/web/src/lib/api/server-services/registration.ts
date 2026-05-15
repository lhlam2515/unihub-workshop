import { API_ROUTES } from "@/constants/api-routes";
import { serverFetch } from "@/lib/api/server";
import { Result } from "@/lib/result";
import type { Registration, RegistrationListItem } from "@/types/registration";

import type { PaginatedItems } from "./catalog";

// ---------------------------------------------------------------------------
// Internal helper: build a query string, skipping undefined/null values.
// ---------------------------------------------------------------------------

function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.set(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

/**
 * List the authenticated student's registrations from within a Server Component.
 *
 * Row-level security enforced server-side — all results are scoped to the JWT subject.
 *
 * @param params - Optional filters (status, upcoming, cursor, limit).
 * @param accessToken - Bearer token for the authenticated student session.
 * @returns OkResult with paginated RegistrationListItem items, or FailResult with ApiError.
 */
export async function listMyRegistrationsServer(
  params: {
    status?: string;
    upcoming?: boolean;
    cursor?: string;
    limit?: number;
  } = {},
  accessToken: string
): Promise<Result<PaginatedItems<RegistrationListItem>>> {
  const query = buildQuery(
    params as Record<string, string | number | boolean | undefined | null>
  );

  return Result.fromPromise(
    serverFetch<{
      data: RegistrationListItem[];
      pagination?: import("@/lib/api/types").PaginationMeta;
    }>(`${API_ROUTES.REGISTRATIONS.MY_LIST}${query}`, accessToken).then(
      (payload) => ({
        items: payload.data,
        pagination: payload.pagination ?? {
          limit: params.limit ?? 20,
          nextCursor: null,
          hasMore: false,
          total: null,
        },
      })
    )
  );
}

/**
 * Fetch a single registration with QR code from within a Server Component.
 *
 * Returns 404 if the registration is not owned by the authenticated student
 * (anti-enumeration protection enforced server-side).
 *
 * @param id - UUID of the target registration.
 * @param accessToken - Bearer token for the authenticated student session.
 * @returns OkResult with Registration, or FailResult with ApiError (REGISTRATION_NOT_FOUND).
 */
export async function getRegistrationServer(
  id: string,
  accessToken: string
): Promise<Result<Registration>> {
  return Result.fromPromise(
    serverFetch<Registration>(
      API_ROUTES.REGISTRATIONS.MY_DETAIL(id),
      accessToken
    )
  );
}
