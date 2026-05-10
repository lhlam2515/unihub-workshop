export type SyncResultKind = "OK" | "DUPLICATE" | "REJECTED";
export type RejectionReason =
  | "QR_INVALID"
  | "WORKSHOP_CANCELLED"
  | "NOT_PAID"
  | "INTERNAL_ERROR";

export interface CheckinSyncResultItem {
  localId: string;
  result: SyncResultKind;
  serverId?: string | null;
  firstCheckinAt?: Date | null;
  firstStaffName?: string | null;
  reason?: RejectionReason | null;
}

export interface CheckinSyncResponseDto {
  results: CheckinSyncResultItem[];
}
