import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

// ---------------------------------------------------------------------------
// Request / Response shapes (matches server CheckinResultDto, CheckinSyncItemSchema, CheckinSyncResponseDto)
// ---------------------------------------------------------------------------

export interface ScanOnlineResponseDto {
  id: string;
  registrationId: string;
  checkedInAt: string;
  receivedAt: string;
  student?: { code: string; name: string } | null;
  duplicate: boolean;
  originallyCheckedInAt?: string | null;
}

export interface OfflineSyncItem {
  localId: string;
  qrCode: string;
  workshopId: string;
  checkedInAt: number; // Unix timestamp (ms)
}

export type SyncResultKind = "OK" | "DUPLICATE" | "REJECTED";
export type RejectionReason = "QR_INVALID" | "WORKSHOP_CANCELLED" | "NOT_PAID";

export interface SyncResultItem {
  localId: string;
  result: SyncResultKind;
  serverId?: string | null;
  firstCheckinAt?: string | null;
  firstStaffName?: string | null;
  reason?: RejectionReason | null;
}

export interface SyncResponseDto {
  results: SyncResultItem[];
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
   * @param qrCode - QR token read from the physical ticket QR code (UUID).
   * @param workshopId - UUID of the workshop being checked in to.
   * @param clientLocalId - Optional local UUID for idempotency tracking.
   *   The `checkedInAt` timestamp is set server-side.
   * @returns OkResult with CheckinResultDto, or FailResult.
   */
  async scanOnline(
    qrCode: string,
    workshopId: string,
    clientLocalId?: string
  ): Promise<Result<ScanOnlineResponseDto>> {
    return Result.fromPromise(
      api.post<ScanOnlineResponseDto>(API_ROUTES.CHECKIN.SCAN, {
        qrCode,
        workshopId,
        checkedInAt: new Date().toISOString(),
        ...(clientLocalId && { clientLocalId }),
      })
    );
  },

  /**
   * Submit a batch of offline check-in records to the server for reconciliation.
   *
   * The server processes each item idempotently and returns per-item results.
   * The caller should update `checkin_queue` rows based on each result:
   * - OK / DUPLICATE → mark as SYNCED
   * - REJECTED → mark as CONFLICT with reason
   *
   * @param items - Array of offline scan records to sync.
   * @returns OkResult with per-item SyncResponseDto, or FailResult.
   */
  async syncOffline(
    deviceId: string,
    items: OfflineSyncItem[]
  ): Promise<Result<SyncResponseDto>> {
    return Result.fromPromise(
      api.post<SyncResponseDto>(API_ROUTES.CHECKIN.SYNC, {
        deviceId,
        items,
      })
    );
  },
};
