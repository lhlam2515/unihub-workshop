import { API_ROUTES } from "@/constants/api-routes";
import { serverFetch } from "@/lib/api/server";
import type { PaginationMeta } from "@/lib/api/types";
import { Result } from "@/lib/result";
import type { DashboardOverview } from "@/types/admin";
import type {
  CircuitBreakerState,
  ImportLog,
  NotificationChannel,
  NotificationLog,
} from "@/types/admin-operations";
import type { RegistrationAdmin } from "@/types/registration";
import type {
  AdminWorkshopFilters,
  AiSummary,
  RoomAdmin,
  SpeakerAdmin,
  WorkshopAdmin,
  WorkshopStats,
} from "@/types/workshop";

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

// ---------------------------------------------------------------------------
// Internal helper: unwrap a paginated server response.
// ---------------------------------------------------------------------------

async function fetchPaginated<T>(
  path: string,
  accessToken: string
): Promise<PaginatedItems<T>> {
  const payload = await serverFetch<{
    data: T[];
    pagination?: PaginationMeta;
  }>(path, accessToken);
  return {
    items: payload.data,
    pagination: payload.pagination ?? {
      limit: 20,
      nextCursor: null,
      hasMore: false,
      total: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 1: Dashboard
// ---------------------------------------------------------------------------

/**
 * Fetch admin dashboard overview metrics from within a Server Component.
 *
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with DashboardOverview, or FailResult with ApiError.
 */
export async function getAdminDashboardOverviewServer(
  accessToken: string
): Promise<Result<DashboardOverview>> {
  return Result.fromPromise(
    serverFetch<DashboardOverview>(API_ROUTES.ADMIN.STATS.OVERVIEW, accessToken)
  );
}

// ---------------------------------------------------------------------------
// Phase 2: Admin Workshops
// ---------------------------------------------------------------------------

/**
 * Fetch paginated admin workshop list from within a Server Component.
 *
 * @param filters - Optional admin filters (status, q, cursor, limit).
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with paginated WorkshopAdmin items, or FailResult with ApiError.
 */
export async function listAdminWorkshopsServer(
  filters: AdminWorkshopFilters = {},
  accessToken: string
): Promise<Result<PaginatedItems<WorkshopAdmin>>> {
  const query = buildQuery(
    filters as Record<string, string | number | boolean | undefined | null>
  );
  return Result.fromPromise(
    fetchPaginated<WorkshopAdmin>(
      `${API_ROUTES.ADMIN.WORKSHOPS.LIST}${query}`,
      accessToken
    )
  );
}

/**
 * Fetch a single admin workshop detail from within a Server Component.
 *
 * @param id - UUID of the target workshop.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with WorkshopAdmin, or FailResult with ApiError.
 */
export async function getAdminWorkshopServer(
  id: string,
  accessToken: string
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    serverFetch<WorkshopAdmin>(
      API_ROUTES.ADMIN.WORKSHOPS.DETAIL(id),
      accessToken
    )
  );
}

/**
 * Fetch workshop KPI stats from within a Server Component.
 *
 * @param id - UUID of the target workshop.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with WorkshopStats, or FailResult with ApiError.
 */
export async function getWorkshopStatsServer(
  id: string,
  accessToken: string
): Promise<Result<WorkshopStats>> {
  return Result.fromPromise(
    serverFetch<WorkshopStats>(
      API_ROUTES.ADMIN.WORKSHOPS.STATS(id),
      accessToken
    )
  );
}

/**
 * Fetch the AI-generated summary state for a workshop from within a Server Component.
 *
 * @param id - UUID of the target workshop.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with AiSummary, or FailResult with ApiError.
 */
export async function getWorkshopSummaryServer(
  id: string,
  accessToken: string
): Promise<Result<AiSummary>> {
  return Result.fromPromise(
    serverFetch<AiSummary>(API_ROUTES.ADMIN.WORKSHOPS.SUMMARY(id), accessToken)
  );
}

/**
 * Fetch paginated registration list for a workshop from within a Server Component.
 *
 * @param workshopId - UUID of the target workshop.
 * @param filters - Optional filters (status, checkedIn, search, cursor, limit).
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with paginated RegistrationAdmin items, or FailResult with ApiError.
 */
export async function listAdminWorkshopRegistrationsServer(
  workshopId: string,
  filters: {
    status?: string;
    checkedIn?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
  } = {},
  accessToken: string
): Promise<Result<PaginatedItems<RegistrationAdmin>>> {
  const query = buildQuery(
    filters as Record<string, string | number | boolean | undefined | null>
  );
  return Result.fromPromise(
    fetchPaginated<RegistrationAdmin>(
      `${API_ROUTES.ADMIN.WORKSHOPS.REGISTRATIONS(workshopId)}${query}`,
      accessToken
    )
  );
}

// ---------------------------------------------------------------------------
// Phase 7: Speakers
// ---------------------------------------------------------------------------

/**
 * Fetch all speakers from within a Server Component.
 *
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with SpeakerAdmin[], or FailResult with ApiError.
 */
export async function listSpeakersServer(
  accessToken: string
): Promise<Result<SpeakerAdmin[]>> {
  return Result.fromPromise(
    serverFetch<SpeakerAdmin[]>(API_ROUTES.ADMIN.SPEAKERS.LIST, accessToken)
  );
}

/**
 * Fetch a single speaker detail from within a Server Component.
 *
 * @param id - UUID of the target speaker.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with SpeakerAdmin, or FailResult with ApiError.
 */
export async function getSpeakerServer(
  id: string,
  accessToken: string
): Promise<Result<SpeakerAdmin>> {
  return Result.fromPromise(
    serverFetch<SpeakerAdmin>(API_ROUTES.ADMIN.SPEAKERS.DETAIL(id), accessToken)
  );
}

// ---------------------------------------------------------------------------
// Phase 7: Rooms
// ---------------------------------------------------------------------------

/**
 * Fetch all rooms from within a Server Component.
 *
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with RoomAdmin[], or FailResult with ApiError.
 */
export async function listRoomsServer(
  accessToken: string
): Promise<Result<RoomAdmin[]>> {
  return Result.fromPromise(
    serverFetch<RoomAdmin[]>(API_ROUTES.ADMIN.ROOMS.LIST, accessToken)
  );
}

/**
 * Fetch a single room detail from within a Server Component.
 *
 * @param id - UUID of the target room.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with RoomAdmin, or FailResult with ApiError.
 */
export async function getRoomServer(
  id: string,
  accessToken: string
): Promise<Result<RoomAdmin>> {
  return Result.fromPromise(
    serverFetch<RoomAdmin>(API_ROUTES.ADMIN.ROOMS.DETAIL(id), accessToken)
  );
}

// ---------------------------------------------------------------------------
// Phase 8: Imports
// ---------------------------------------------------------------------------

/**
 * Fetch paginated import run list from within a Server Component.
 *
 * @param filters - Optional filters (status, cursor, limit).
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with paginated ImportLog items, or FailResult with ApiError.
 */
export async function listImportsServer(
  filters: { status?: string; cursor?: string; limit?: number } = {},
  accessToken: string
): Promise<Result<PaginatedItems<ImportLog>>> {
  const query = buildQuery(
    filters as Record<string, string | number | boolean | undefined | null>
  );
  return Result.fromPromise(
    fetchPaginated<ImportLog>(
      `${API_ROUTES.ADMIN.IMPORTS.LIST}${query}`,
      accessToken
    )
  );
}

/**
 * Fetch a single import run detail from within a Server Component.
 *
 * @param id - UUID of the target import run.
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with ImportLog, or FailResult with ApiError.
 */
export async function getImportServer(
  id: string,
  accessToken: string
): Promise<Result<ImportLog>> {
  return Result.fromPromise(
    serverFetch<ImportLog>(API_ROUTES.ADMIN.IMPORTS.DETAIL(id), accessToken)
  );
}

// ---------------------------------------------------------------------------
// Phase 8: Notifications
// ---------------------------------------------------------------------------

/**
 * Fetch all notification channel configurations from within a Server Component.
 *
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with NotificationChannel[], or FailResult with ApiError.
 */
export async function listNotificationChannelsServer(
  accessToken: string
): Promise<Result<NotificationChannel[]>> {
  return Result.fromPromise(
    serverFetch<NotificationChannel[]>(
      API_ROUTES.ADMIN.NOTIFICATIONS.CHANNELS,
      accessToken
    )
  );
}

/**
 * Fetch paginated notification dispatch logs from within a Server Component.
 *
 * @param filters - Optional filters (status, channel, from, to, cursor, limit).
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with paginated NotificationLog items, or FailResult with ApiError.
 */
export async function listNotificationLogsServer(
  filters: {
    status?: string;
    channel?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  } = {},
  accessToken: string
): Promise<Result<PaginatedItems<NotificationLog>>> {
  const query = buildQuery(
    filters as Record<string, string | number | boolean | undefined | null>
  );
  return Result.fromPromise(
    fetchPaginated<NotificationLog>(
      `${API_ROUTES.ADMIN.NOTIFICATIONS.LOGS}${query}`,
      accessToken
    )
  );
}

// ---------------------------------------------------------------------------
// Phase 8: System / Circuit Breaker
// ---------------------------------------------------------------------------

/**
 * Fetch circuit breaker state for all payment gateways from within a Server Component.
 *
 * @param accessToken - Bearer token for the authenticated organizer session.
 * @returns OkResult with CircuitBreakerState[], or FailResult with ApiError.
 */
export async function getCircuitBreakerStateServer(
  accessToken: string
): Promise<Result<CircuitBreakerState[]>> {
  return Result.fromPromise(
    serverFetch<CircuitBreakerState[]>(
      API_ROUTES.ADMIN.SYSTEM.CIRCUIT_BREAKERS,
      accessToken
    )
  );
}
