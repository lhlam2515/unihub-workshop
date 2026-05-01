import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

// ---------------------------------------------------------------------------
// Request / Response shapes
// ---------------------------------------------------------------------------

export interface ScanOnlineResponseDto {
  checkin_id: string;
  checked_in_at: string;
  student: {
    student_id: string;
    full_name: string;
    student_code: string;
  };
}

export interface OfflineSyncItem {
  qr_token: string;
  workshop_id: string;
  checked_in_at: string;
  device_id: string;
}

export interface SyncResultDto {
  synced: number;
  skipped: number;
  conflicts: number;
}

// ---------------------------------------------------------------------------
// checkinApi
// ---------------------------------------------------------------------------

export const checkinApi = {
  /**
   * Validate a QR token and record an online check-in on the server.
   *
   * Called when the device has network access during scanning.
   * On success, the caller should also write a SYNCED record to the local
   * `checkin_queue` table for audit trail consistency.
   *
   * @param qrToken - QR token read from the physical ticket QR code.
   * @param workshopId - UUID of the workshop being checked in to.
   * @param deviceId - Optional device identifier for tracing.
   * @returns OkResult with checkin_id and checked_in_at, or FailResult.
   */
  async scanOnline(
    qrToken: string,
    workshopId: string,
    deviceId?: string
  ): Promise<Result<ScanOnlineResponseDto>> {
    return Result.fromPromise(
      api.post<ScanOnlineResponseDto>(API_ROUTES.CHECKIN.SCAN, {
        qr_token: qrToken,
        workshop_id: workshopId,
        device_id: deviceId,
      })
    );
  },

  /**
   * Submit a batch of offline check-in records to the server for reconciliation.
   *
   * The server processes each item with `INSERT ON CONFLICT DO NOTHING`.
   * After this call, the caller should update `checkin_queue` rows:
   * - Items from `synced` count → status = SYNCED
   * - Items from `conflicts` count → status = CONFLICT
   *
   * @param items - Array of offline scan records to sync.
   * @returns OkResult with sync counts (synced, skipped, conflicts), or FailResult.
   */
  async syncOffline(
    workshopId: string,
    items: OfflineSyncItem[]
  ): Promise<Result<SyncResultDto>> {
    return Result.fromPromise(
      api.post<SyncResultDto>(API_ROUTES.CHECKIN.SYNC, {
        workshop_id: workshopId,
        items,
      })
    );
  },
};
