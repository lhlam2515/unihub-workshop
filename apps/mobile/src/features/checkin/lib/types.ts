import type { TicketDto } from "../api/tickets.service";

export type PreloadStatus = "idle" | "loading" | "done" | "error";

export interface UsePreloadResult {
  status: PreloadStatus;
  errorMessage: string | null;
  preload: (workshopId: string) => Promise<void>;
}

export type ScanStatus = "idle" | "scanning" | "success" | "error";

export interface ScanResult {
  checkinId?: string;
  studentName: string;
  studentCode: string;
  checkedInAt: Date;
  source: "ONLINE" | "OFFLINE_QUEUED";
}

export interface UseScanResult {
  status: ScanStatus;
  result: ScanResult | null;
  errorMessage: string | null;
  scan: (
    qrToken: string,
    workshopId: string,
    deviceId: string,
    staffId: string
  ) => Promise<void>;
  reset: () => void;
}

export type SyncRunStatus = "idle" | "syncing" | "done" | "error";

export interface SyncStats {
  pending: number;
  synced: number;
  conflicts: number;
  failed: number;
}

export interface UseSyncResult {
  stats: SyncStats;
  runStatus: SyncRunStatus;
  errorMessage: string | null;
  sync: (workshopId: string, deviceId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseMyTicketsResult {
  tickets: TicketDto[];
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
}
