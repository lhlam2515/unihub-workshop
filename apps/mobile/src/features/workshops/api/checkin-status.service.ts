import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

export interface CheckinStatus {
  confirmedCount: number;
  checkedInCount: number;
  pendingCount: number;
  recentCheckins: {
    checkinId: string;
    studentName: string;
    studentCode: string;
    checkedInAt: string;
    source: string;
  }[];
}

class CheckinStatusService {
  /**
   * Fetch real-time check-in statistics for a workshop.
   *
   * @param workshopId - The workshop UUID
   * @returns OkResult with CheckinStatus, or FailResult with ApiError
   */
  async getStatus(workshopId: string): Promise<Result<CheckinStatus>> {
    return Result.fromPromise(
      api.get<CheckinStatus>(API_ROUTES.CHECKIN.STATUS(workshopId))
    );
  }
}

export const checkinStatusService = new CheckinStatusService();
