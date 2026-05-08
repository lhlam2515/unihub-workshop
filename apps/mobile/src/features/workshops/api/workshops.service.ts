import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

export interface WorkshopSummary {
  workshop_id: string;
  title: string;
  speaker_name: string;
  starts_at: string;
  ends_at?: string;
  available_seats: number;
  is_paid: boolean;
  price?: number;
  room_name?: string;
  status?: string;
}

class WorkshopsService {
  /**
   * Fetch a single workshop's public detail by ID.
   *
   * @param workshopId - The workshop UUID from the JWT `allowedWorkshopIds`
   * @returns OkResult with WorkshopSummary, or FailResult with ApiError
   */
  async getWorkshopById(workshopId: string): Promise<Result<WorkshopSummary>> {
    return Result.fromPromise(
      api.get<WorkshopSummary>(API_ROUTES.WORKSHOPS.DETAIL(workshopId))
    );
  }

  /**
   * Fetch details for multiple workshops in parallel.
   *
   * Requests are made concurrently via Promise.all. Individual failures
   * are captured per-result so the caller can render partial data.
   *
   * @param workshopIds - Array of workshop UUIDs from JWT payload
   * @returns Array of Results in the same order as the input IDs
   */
  async getWorkshopsByIds(
    workshopIds: string[]
  ): Promise<Result<WorkshopSummary>[]> {
    return Promise.all(workshopIds.map((id) => this.getWorkshopById(id)));
  }
}

export const workshopsService = new WorkshopsService();
