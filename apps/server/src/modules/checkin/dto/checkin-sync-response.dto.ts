export type SyncResultKind = "OK" | "DUPLICATE" | "REJECTED";
export type RejectionReason = "QR_INVALID" | "WORKSHOP_CANCELLED" | "NOT_PAID";

export interface CheckinSyncResultItem {
  localId: string;
  result: SyncResultKind;
  serverId?: string | null;
  firstCheckinAt?: string | null;
  firstStaffName?: string | null;
  reason?: RejectionReason | null;
}

export interface CheckinSyncResponseDto {
  results: CheckinSyncResultItem[];
}
