import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

// ---------------------------------------------------------------------------
// Response shapes (mirrors server TicketResponseDto)
// ---------------------------------------------------------------------------

export interface TicketDto {
  ticket_id: string;
  registration_id: string;
  qr_token: string;
  status: string;
  workshop: {
    workshop_id: string;
    title: string;
    starts_at: string;
    ends_at: string;
  };
  student: {
    student_id: string;
    full_name: string;
    student_code: string;
  };
  issued_at: string;
}

// ---------------------------------------------------------------------------
// ticketsApi
// ---------------------------------------------------------------------------

export const ticketsApi = {
  /**
   * Fetch all ACTIVE tickets for a workshop for offline pre-load into SQLite cache.
   *
   * Called by CHECKIN_STAFF before entering a venue with unreliable WiFi.
   * Response is stored in `cached_tickets` table for offline QR validation.
   *
   * @param workshopId - UUID of the workshop to preload.
   * @returns OkResult with ticket list, or FailResult with the thrown error.
   */
  async preload(workshopId: string): Promise<Result<TicketDto[]>> {
    return Result.fromPromise(
      api.get<TicketDto[]>(API_ROUTES.CHECKIN.PRELOAD_TICKETS(workshopId))
    );
  },

  /**
   * Fetch all ACTIVE tickets belonging to the authenticated student.
   *
   * Used in the student ticket list screen to display QR codes.
   * Scoped by jwt.sub server-side — no student_id param needed.
   *
   * @returns OkResult with ticket list, or FailResult with the thrown error.
   */
  async getMyTickets(): Promise<Result<TicketDto[]>> {
    return Result.fromPromise(api.get<TicketDto[]>("/students/me/tickets"));
  },
};
