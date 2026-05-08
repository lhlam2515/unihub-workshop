import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

export interface WorkshopDetailDto {
  workshopId: string;
  title: string;
  speakerName: string;
  startsAt: string;
  endsAt: string;
  availableSeats: number;
  isPaid: boolean;
  price?: number;
  description?: string;
  roomName: string;
}

class WorkshopsService {
  /**
   * Fetch a single workshop's public detail by ID.
   *
   * @param workshopId - The workshop UUID from the JWT `allowedWorkshopIds`
   * @returns OkResult with WorkshopDetailDto, or FailResult with ApiError
   */
  async getWorkshopById(
    workshopId: string
  ): Promise<Result<WorkshopDetailDto>> {
    return Result.fromPromise(
      api.get<WorkshopDetailDto>(API_ROUTES.WORKSHOPS.DETAIL(workshopId))
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
  ): Promise<Result<WorkshopDetailDto>[]> {
    return Promise.all(workshopIds.map((id) => this.getWorkshopById(id)));
  }
}

export const workshopsService = new WorkshopsService();
