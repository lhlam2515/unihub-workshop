import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/lib/api/types";
import { Result } from "@/lib/result";

// ---------------------------------------------------------------------------
// Response shapes (mirrors server CachedRegistrationDto + paginated response)
// ---------------------------------------------------------------------------

export interface CachedRegistrationDto {
  registrationId: string;
  qrCode: string;
  workshopId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  registrationStatus: string;
  workshopStartsAt: string;
  workshopTitle: string;
}

// Unwrapped paginated preload response shape
export interface PreloadResponse {
  data: CachedRegistrationDto[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Legacy student ticket types (kept for backward compat — mobile is CHECKIN_STAFF only)
// ---------------------------------------------------------------------------

export interface TicketDto {
  ticketId: string;
  registrationId: string;
  qrCode: string;
  status: string;
  workshop: {
    workshopId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  };
  student: {
    studentId: string;
    fullName: string;
    studentCode: string;
  };
  issuedAt: string;
}

// ---------------------------------------------------------------------------
// ticketsApi
// ---------------------------------------------------------------------------

export const ticketsApi = {
  /**
   * Fetch all active registrations for a workshop for offline pre-load into SQLite cache.
   *
   * Called by CHECKIN_STAFF before entering a venue with unreliable WiFi.
   * Response is paginated — caller should follow `pagination.nextCursor`.
   *
   * @param workshopId - UUID of the workshop to preload.
   * @param cursor - Optional cursor for pagination.
   * @param limit - Page size (default 500, max 500).
   * @returns OkResult with paginated registration list, or FailResult.
   */
  async preload(
    workshopId: string,
    cursor?: string,
    limit: number = 500
  ): Promise<Result<PreloadResponse>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    return Result.fromPromise(
      api.get<PreloadResponse>(
        `${API_ROUTES.CHECKIN.PRELOAD_REGISTRATIONS(workshopId)}?${params.toString()}`
      )
    );
  },

  /** @deprecated Student-only endpoint — mobile is CHECKIN_STAFF only */
  async getMyTickets(): Promise<Result<TicketDto[]>> {
    return Result.fromPromise(api.get<TicketDto[]>("/students/me/tickets"));
  },
};
