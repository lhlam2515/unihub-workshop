/**
 * Canonical TypeScript types derived from docs/api/openapi.yaml component schemas.
 *
 * These interfaces are the authoritative API contract. All response DTOs must
 * conform to the shapes defined here. Prefixed with `Api` to distinguish from
 * internal DB types (e.g. ApiPayment vs Payment DB entity).
 *
 * Naming: ApiXxx mirrors the OpenAPI schema name (e.g. ApiWorkshopAdmin ← WorkshopAdmin).
 */

// ---------------------------------------------------------------------------
// Shared / Envelope
// ---------------------------------------------------------------------------

export interface ApiPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** Only populated for offset-aware admin endpoints; null for cursor-based lists. */
  total?: number | null;
}

export interface ApiRequestMeta {
  requestId: string;
  /** RFC 3339 timestamp */
  timestamp: string;
  apiVersion: string;
  processingMs?: number;
}

export interface ApiFieldError {
  field: string;
  rule: string;
  message: string;
  received?: unknown;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: ApiFieldError[];
  };
  meta: ApiRequestMeta;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  pagination?: ApiPaginationMeta;
  meta: ApiRequestMeta;
}

// ---------------------------------------------------------------------------
// Auth — LoginRequest, LoginResponse, User
// ---------------------------------------------------------------------------

export interface ApiLoginRequest {
  accountType: "STUDENT" | "STAFF";
  password: string;
  /** Required when accountType = STUDENT */
  studentId?: string;
  /** Required when accountType = STAFF */
  email?: string;
}

export interface ApiUser {
  /** studentId (TEXT) for STUDENT role; UUID for staff roles */
  id: string;
  role: "STUDENT" | "BTC" | "CHECKIN_STAFF";
  fullName: string;
  email: string;
  /** Only populated for CHECKIN_STAFF */
  allowedWorkshopIds?: string[];
}

export interface ApiLoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  /** Always 900 (15 minutes) */
  expiresIn: number;
  role: "STUDENT" | "BTC" | "CHECKIN_STAFF";
  /**
   * Present in body only for mobile clients (CHECKIN_STAFF).
   * Web clients receive the refresh token via HttpOnly cookie — null in body.
   */
  refreshToken: string | null;
  user: ApiUser;
}

// ---------------------------------------------------------------------------
// Device Tokens
// ---------------------------------------------------------------------------

export interface ApiDeviceTokenRequest {
  token: string;
  platform: "IOS" | "ANDROID";
}

export interface ApiDeviceToken {
  id: string;
  platform: "IOS" | "ANDROID";
  isActive: boolean;
  lastSeen?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Catalog — Speaker, Room, Workshop
// ---------------------------------------------------------------------------

export interface ApiSpeakerSummary {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
}

export interface ApiSpeaker extends ApiSpeakerSummary {
  bio: string | null;
}

export interface ApiSpeakerCreateRequest {
  fullName: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface ApiRoomSummary {
  id: string;
  name: string;
  building: string | null;
  floor: number | null;
  floorPlanUrl: string | null;
}

export interface ApiRoom extends ApiRoomSummary {
  capacity: number;
  facilities?: Record<string, unknown>;
  createdAt: string;
}

export interface ApiRoomCreateRequest {
  name: string;
  building?: string;
  floor?: number;
  capacity: number;
  floorPlanUrl?: string;
  facilities?: Record<string, unknown>;
}

export interface ApiAiSummary {
  status: "NONE" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  /** Present when status = DONE */
  text: string | null;
  updatedAt: string | null;
  /** Present when status = FAILED */
  errorDetail: string | null;
}

export type ApiWorkshopStatus = "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED";

/** Corresponds to OpenAPI WorkshopListItem */
export interface ApiWorkshopListItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  /** Cache hint — may be up to 10 s stale */
  seatsAvailable: number;
  price: number;
  currency: string;
  status: ApiWorkshopStatus;
  speaker: ApiSpeakerSummary | null;
  room: ApiRoomSummary | null;
  /** True if the authenticated student has an active registration; null if anonymous */
  isRegistered: boolean | null;
}

/** Corresponds to OpenAPI WorkshopDetail */
export interface ApiWorkshopDetail extends ApiWorkshopListItem {
  description: string | null;
  speaker: ApiSpeaker | null;
  room: ApiRoom | null;
  summary: ApiAiSummary | null;
  myRegistrationId: string | null;
}

/** Corresponds to OpenAPI WorkshopAdmin */
export interface ApiWorkshopAdmin extends ApiWorkshopDetail {
  /** Optimistic lock counter — also exposed as ETag */
  version: number;
  pdfUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWorkshopAvailability {
  workshopId: string;
  seatsAvailable: number;
  /** Cache timestamp — when the value was last refreshed from PostgreSQL */
  asOf: string;
}

export interface ApiWorkshopCreateRequest {
  title: string;
  description?: string;
  speakerId?: string | null;
  roomId?: string | null;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  price: number;
  status?: "DRAFT" | "OPEN";
}

export interface ApiWorkshopPatchRequest {
  title?: string;
  description?: string;
  speakerId?: string;
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  seatsTotal?: number;
  price?: number;
}

export interface ApiWorkshopStats {
  registrations?: {
    total: number;
    byStatus: Record<string, number>;
  };
  checkins?: {
    total: number;
    /** Ratio in [0, 1] */
    rate: number;
  };
  revenue?: {
    amount: number;
    currency: string;
  };
}

// ---------------------------------------------------------------------------
// Booking — Registration
// ---------------------------------------------------------------------------

export type ApiRegistrationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PAID"
  | "CANCELLED";

export interface ApiRegistrationNextStep {
  action: "CREATE_PAYMENT";
  endpoint: string;
  amount: number;
  currency: string;
  expiresAt: string;
}

/** Corresponds to OpenAPI Registration */
export interface ApiRegistration {
  id: string;
  workshopId: string;
  status: ApiRegistrationStatus;
  /** Present when status ∈ {CONFIRMED, PAID}; null otherwise */
  qrCode: string | null;
  registeredAt: string;
  /** Present only for paid workshops where status = PENDING */
  nextStep: ApiRegistrationNextStep | null;
}

/** Corresponds to OpenAPI RegistrationListItem */
export interface ApiRegistrationListItem {
  id: string;
  workshopId: string;
  workshop?: ApiWorkshopListItem;
  status: ApiRegistrationStatus;
  qrCode: string | null;
  registeredAt: string;
  // nextStep is intentionally absent — RegistrationListItem is a separate schema from Registration
}

export interface ApiRegistrationCreateRequest {
  workshopId: string;
}

/** Corresponds to OpenAPI RegistrationAdmin */
export interface ApiRegistrationAdmin {
  id: string;
  workshopId: string;
  student: {
    studentId: string;
    fullName: string;
    email: string;
  };
  status: ApiRegistrationStatus;
  registeredAt: string;
  checkedInAt: string | null;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export type ApiPaymentGateway = "VNPAY" | "STRIPE" | "MOMO" | "MOCK";
export type ApiPaymentStatus =
  | "INITIATED"
  | "SUCCEEDED"
  | "FAILED"
  | "UNRESOLVED";

export interface ApiPaymentCreateRequest {
  registrationId: string;
  gateway: ApiPaymentGateway;
  /** Where the gateway redirects the browser after payment */
  returnUrl: string;
}

/** Corresponds to OpenAPI CreatePaymentResponse */
export interface ApiCreatePaymentResponse {
  paymentId: string;
  redirectUrl: string;
  paymentDeadline: string;
}

/** Corresponds to OpenAPI Payment */
export interface ApiPayment {
  id: string;
  registrationId: string;
  amount: number;
  currency: string;
  gateway?: ApiPaymentGateway;
  /** Set after the gateway responds; null while status = INITIATED or UNRESOLVED */
  gatewayChargeId: string | null;
  status: ApiPaymentStatus;
  /** Returned with payment success response (registration's QR) */
  qrCode: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** Corresponds to OpenAPI CachedRegistration */
export interface ApiCachedRegistration {
  registrationId: string;
  qrCode: string;
  workshopId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  registrationStatus: "PAID" | "CONFIRMED";
  workshopStartsAt?: string;
  workshopTitle?: string;
}

export interface ApiCheckinCreateRequest {
  qrCode: string;
  workshopId: string;
  /** Device timestamp at the moment of QR scan */
  checkedInAt: string;
  /** Optional — matches the localId from mobile SQLite */
  clientLocalId?: string;
}

/** Corresponds to OpenAPI CheckinResult */
export interface ApiCheckinResult {
  id: string;
  registrationId: string;
  checkedInAt: string;
  receivedAt: string;
  student?: { code: string; name: string } | null;
  /** True if the registration was already checked in (200 path) */
  duplicate: boolean;
  /** Present when duplicate = true */
  originallyCheckedInAt: string | null;
}

/** Corresponds to OpenAPI CheckinStatus */
export interface ApiCheckinStatus {
  confirmedCount: number;
  checkedInCount: number;
  /** confirmedCount - checkedInCount */
  pendingCount: number;
  /** Up to 20 most recent check-in records */
  recentCheckins?: Array<{
    checkinId: string;
    studentName: string;
    studentCode: string;
    checkedInAt: string;
    source: string;
  }>;
}

export type ApiCheckinSyncResult = "OK" | "DUPLICATE" | "REJECTED";
export type ApiCheckinRejectionReason =
  | "QR_INVALID"
  | "WORKSHOP_CANCELLED"
  | "NOT_PAID";

/** Corresponds to OpenAPI CheckinSyncResultItem */
export interface ApiCheckinSyncResultItem {
  localId: string;
  result: ApiCheckinSyncResult;
  /** Present only when result = OK */
  serverId: string | null;
  /** Present when result = DUPLICATE */
  firstCheckinAt: string | null;
  firstStaffName: string | null;
  /** Present when result = REJECTED */
  reason: ApiCheckinRejectionReason | null;
}

export interface ApiCheckinSyncResponse {
  results: ApiCheckinSyncResultItem[];
}

// ---------------------------------------------------------------------------
// AI Summary
// ---------------------------------------------------------------------------

// ApiAiSummary is defined above (inline in Catalog section, shared by both modules)

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

/** Corresponds to OpenAPI ImportLog */
export interface ApiImportLog {
  id: string;
  /** ISO 8601 timestamp of when the job ran */
  runAt: string;
  triggeredBy: "CRON" | "MANUAL";
  status: "IN_PROGRESS" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILED";
  totalRows: number | null;
  successCount: number | null;
  failedCount: number | null;
  /** Processing duration in milliseconds */
  durationMs: number | null;
  /** Path to the source CSV file */
  filePath: string | null;
  /** Link to download the error CSV; only when failedCount > 0 */
  errorFileUrl: string | null;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export type ApiNotificationChannel = "EMAIL" | "APP" | "TELEGRAM";
export type ApiNotificationStatus = "SENT" | "FAILED" | "TIMEOUT";

/** Corresponds to OpenAPI NotificationChannel */
export interface ApiNotificationChannelConfig {
  id: string;
  channelType: ApiNotificationChannel;
  isActive: boolean;
  /** Channel-specific config (SMTP host, FCM project, Telegram bot token, etc.) */
  configJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Corresponds to OpenAPI NotificationLog */
export interface ApiNotificationLog {
  id: string;
  /** TEXT — studentId or staff UUID */
  userId: string;
  eventType: string;
  channel: ApiNotificationChannel;
  status: ApiNotificationStatus;
  errorMsg: string | null;
  /** Snapshot of the dispatched payload */
  payload?: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// System Admin — Circuit Breaker, Job Status
// ---------------------------------------------------------------------------

/** Corresponds to OpenAPI CircuitBreakerState */
export interface ApiCircuitBreakerState {
  gateway: ApiPaymentGateway;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  /** Consecutive failures since last CLOSED reset */
  failureCount: number;
  /** When the CB transitioned to OPEN; null if CLOSED */
  openedAt: string | null;
  lastAttempt: string | null;
  /** When CB will transition to HALF_OPEN (OPEN + 30 s); null if not OPEN */
  autoCloseAt: string | null;
}

/** Corresponds to OpenAPI PaymentTimeoutJobStatus */
export interface ApiPaymentTimeoutJobStatus {
  /** Payments currently in INITIATED state */
  pendingCount: number;
  /** Payments that exceeded the gateway timeout threshold */
  timeoutCount: number;
  lastRun: string;
  nextRun: string;
  jobStatus: "RUNNING" | "IDLE" | "ERROR";
}

/** Corresponds to OpenAPI ReconciliationJobStatus */
export interface ApiReconciliationJobStatus {
  /** Total workshops with unresolved payments in the scan window */
  totalWorkshops: number;
  /** Payments whose gateway status differs from DB status */
  discrepanciesFound: number;
  lastRun: string;
  nextRun: string;
  lastAlert: string | null;
}

// ---------------------------------------------------------------------------
// User Admin
// ---------------------------------------------------------------------------

/** Corresponds to OpenAPI UserResponse */
export interface ApiUserResponse {
  userId: string;
  email: string;
  role: "STUDENT" | "BTC" | "CHECKIN_STAFF";
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
}

export interface ApiUpdateUserStatusRequest {
  status: "ACTIVE" | "SUSPENDED";
}

export interface ApiAssignWorkshopsRequest {
  workshopIds: string[];
}
