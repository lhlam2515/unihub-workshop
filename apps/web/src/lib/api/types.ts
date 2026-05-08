/**
 * Mirror the server's ErrorCategory union for category-based handling on the client.
 */
export type ErrorCategory =
  | "VALIDATION"
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "RATE_LIMIT"
  | "BUSINESS"
  | "EXTERNAL"
  | "OVERLOADED"
  | "INTERNAL";

/**
 * Mirror the server's stable error codes for typed error handling on the client.
 */
export type ErrorCode =
  | "SEAT_UNAVAILABLE"
  | "SEAT_LOCK_EXPIRED"
  | "REGISTRATION_DUPLICATE"
  | "REGISTRATION_NOT_FOUND"
  | "REGISTRATION_CANCELLED"
  | "PAYMENT_DUPLICATE"
  | "PAYMENT_GATEWAY_ERROR"
  | "PAYMENT_GATEWAY_OPEN"
  | "PAYMENT_TIMEOUT"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_ALREADY_SUCCESS"
  | "WORKSHOP_NOT_FOUND"
  | "WORKSHOP_NOT_OPEN"
  | "WORKSHOP_CANCELLED"
  | "WORKSHOP_FULL"
  | "WORKSHOP_TIME_CONFLICT"
  | "WORKSHOP_NOT_ASSIGNED"
  | "ROOM_CONFLICT"
  | "SEATS_TOTAL_BELOW_REGISTERED"
  | "CANNOT_PUBLISH"
  | "CANNOT_CANCEL"
  | "TICKET_NOT_FOUND"
  | "TICKET_VOID"
  | "TICKET_ALREADY_CHECKEDIN"
  | "CHECKIN_SCOPE_DENIED"
  | "QR_INVALID"
  | "REGISTRATION_NOT_ACTIVE"
  | "WRONG_WORKSHOP"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "REFRESH_TOKEN_INVALID"
  | "REFRESH_EXPIRED"
  | "USER_NOT_FOUND"
  | "USER_SUSPENDED"
  | "STUDENT_NOT_IN_CSV"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "REQUEST_IN_PROGRESS"
  | "CONFLICT_EXHAUSTED"
  | "RECONCILIATION_ALREADY_RUNNING"
  | "NOT_IN_FAILED_STATE"
  | "BATCH_TOO_LARGE"
  | "RATE_LIMIT_EXCEEDED"
  | "DB_LOCK_TIMEOUT"
  | "VALIDATION_FAILED"
  | "INTERNAL_ERROR";

/**
 * Field-level validation error returned in the error payload.
 */
export interface FieldError {
  /** Field identifier used to render inline form errors. */
  field: string;
  /** Validation rule identifier for localized message mapping. */
  rule: string;
  /** Human-readable message safe for display. */
  message: string;
}

/**
 * Sanitized error payload exposed in the API response envelope.
 */
export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldError[];
}

/**
 * Pagination metadata for cursor-based pagination (API spec §0.6).
 *
 * Cursor-based for write-heavy lists (registrations, check-in queue),
 * offset-aware for admin dashboards.
 */
export interface PaginationMeta {
  /** Number of items per page */
  limit: number;
  /** Opaque cursor — pass as `?cursor=` for next page. `null` when `hasMore=false` */
  nextCursor: string | null;
  /** True if more items exist beyond this page */
  hasMore: boolean;
  /** Only populated for offset-aware admin endpoints. `null` for cursor-based. */
  total: number | null;
}

/**
 * Request metadata always included in every API response.
 */
export interface RequestMeta {
  requestId: string;
  timestamp: string;
  apiVersion: string;
  processingMs?: number;
}

/**
 * Standard API response envelope.
 *
 * Discriminated union on `success`:
 * - `success: true`  → `data` is present, `error` is absent
 * - `success: false` → `error` is present, `data` is absent
 */
export type ApiResponse<T = void> =
  | {
      success: true;
      data: T;
      error?: never;
      pagination?: PaginationMeta;
      meta: RequestMeta;
    }
  | {
      success: false;
      data?: never;
      error: ApiErrorShape;
      pagination?: never;
      meta: RequestMeta;
    };

/**
 * Container shape for paginated list responses.
 *
 * Matches API spec format: `"data": [...]` alongside `"pagination": {...}`
 * at the response envelope level.
 */
export interface PaginatedData<T> {
  data: T[];
}

// ---------------------------------------------------------------------------
// Client-side request configuration
// ---------------------------------------------------------------------------

/**
 * Options accepted by every API call through the client.
 */
export interface RequestOptions extends Omit<RequestInit, "body" | "method"> {
  /** Query string parameters serialized as URLSearchParams. */
  params?: Record<string, string | number | boolean | undefined | null>;
}
