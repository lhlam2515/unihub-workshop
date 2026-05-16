export type ImportStatus =
  | "IN_PROGRESS"
  | "SUCCESS"
  | "PARTIAL_FAILURE"
  | "FAILED";
export type ImportTriggeredBy = "CRON" | "MANUAL";

export interface ImportLog {
  id: string;
  runAt: string;
  triggeredBy: ImportTriggeredBy;
  status: ImportStatus;
  totalRows: number;
  successCount: number;
  failedCount: number;
  durationMs: number | null;
  filePath: string | null;
  errorFileUrl: string | null;
}

export type ChannelType = "EMAIL" | "IN_APP" | "TELEGRAM";

export interface NotificationChannel {
  id: string;
  channelType: ChannelType;
  isActive: boolean;
  configJson: Record<string, unknown>;
  lastUpdatedAt: string;
}

export type NotificationLogStatus = "SENT" | "FAILED" | "TIMEOUT";

export interface NotificationLog {
  id: string;
  userId: string;
  eventType: string;
  channel: ChannelType;
  status: NotificationLogStatus;
  errorMsg: string | null;
  createdAt: string;
}

export type CBState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type PaymentGateway = "VNPAY" | "STRIPE" | "MOMO" | "MOCK";

export interface CircuitBreakerState {
  gateway: PaymentGateway;
  state: CBState;
  failureCount: number;
  openedAt: string | null;
  lastAttempt: string | null;
}

export interface ReconcileResponse {
  jobId: string;
  startedAt: string;
  unresolvedCount: number;
}

export interface ImportLogDetail extends ImportLog {
  errorBreakdown?: Record<string, number>;
  successPercent?: number;
}
