/**
 * Define high-level error categories used for HTTP mapping
 *
 * Business rules:
 * - Each category maps to exactly one HTTP status code
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
 * Define stable application error codes used across the API
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
  | "WORKSHOP_NOT_PUBLISHED"
  | "WORKSHOP_ALREADY_PUBLISHED"
  | "WORKSHOP_CANCELLED"
  | "WORKSHOP_FULL"
  | "WORKSHOP_TIME_CONFLICT"
  | "TICKET_NOT_FOUND"
  | "TICKET_VOID"
  | "TICKET_ALREADY_CHECKEDIN"
  | "CHECKIN_SCOPE_DENIED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "REFRESH_TOKEN_INVALID"
  | "USER_NOT_FOUND"
  | "USER_SUSPENDED"
  | "STUDENT_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMIT_EXCEEDED"
  | "UPLOAD_FAILED"
  | "DELETE_FAILED"
  | "DB_LOCK_TIMEOUT"
  | "ROOM_NOT_FOUND"
  | "SPEAKER_NOT_FOUND"
  | "STORAGE_DOWNLOAD_FAILED"
  | "STORAGE_FILE_NOT_FOUND"
  | "NOTIFICATION_LOG_NOT_FOUND"
  | "NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND"
  | "NOTIFICATION_CHANNEL_INACTIVE"
  | "NOTIFICATION_CHANNEL_UNKNOWN"
  | "VALIDATION_FAILED"
  | "PDF_EXTRACTION_FAILED"
  | "LLM_TIMEOUT"
  | "LLM_API_ERROR"
  | "CONCURRENT_MODIFICATION"
  | "IDEMPOTENCY_CONFLICT"
  | "DEVICE_TOKEN_NOT_FOUND"
  | "INTERNAL_ERROR";

/**
 * Describe a validation failure tied to a specific field
 */
export interface FieldError {
  /** Field identifier used by clients to render field-level errors. */
  field: string;
  /** Rule identifier used by clients to map to localized messages. */
  rule: string;
  /** Human-readable message safe for client display. */
  message: string;
  /** Raw input captured for diagnostics when safe to log. */
  received?: unknown;
}

/**
 * Describe the internal error shape used by services and domain logic
 */
export interface AppError {
  /** Category used for HTTP mapping. */
  category: ErrorCategory;
  /** Stable error code used by clients and analytics. */
  code: ErrorCode;
  /** Human-readable message safe for client exposure. */
  message: string;
  /** Optional field-level validation details for user input errors. */
  fieldErrors?: FieldError[];
  /** Optional internal context for logging and trace correlation. */
  context?: Record<string, unknown>;
  /** Optional original cause preserved for diagnostics. */
  cause?: unknown;
}

/**
 * Describe pagination metadata returned with list responses
 */
export interface PaginationMeta {
  /** Current page index used for navigation. */
  page: number;
  /** Page size requested by the client. */
  limit: number;
  /** Total number of items matching the query. */
  total: number;
  /** Total number of pages calculated from total and limit. */
  totalPages: number;
  /** Whether another page is available after the current one. */
  hasNextPage: boolean;
  /** Whether a page exists before the current one. */
  hasPrevPage: boolean;
}

/**
 * Describe metadata attached to every API response
 */
export interface RequestMeta {
  /** Correlation identifier used for tracing and logs. */
  requestId: string;
  /** Timestamp captured when the response is built. */
  timestamp: string;
  /** API version tag included for client compatibility. */
  apiVersion: string;
  /** Optional processing duration reported by the server. */
  processingMs?: number;
}

/**
 * Describe the public error payload exposed to API clients
 */
export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldError[];
}

/**
 * Define the standard API response envelope used by the server
 *
 * Business rules:
 * - `success` determines whether data or error is present
 * - `meta` is always included for tracing
 */
export type ApiResponse<T = void> =
  | {
      /** Indicates a successful response. */
      success: true;
      /** Response payload serialized for the client. */
      data: T;
      error?: never;
      /** Pagination details for list responses. */
      pagination?: PaginationMeta;
      /** Request metadata for tracing and diagnostics. */
      meta: RequestMeta;
    }
  | {
      /** Indicates a failed response. */
      success: false;
      data?: never;
      /** Sanitized error payload. */
      error: ApiErrorShape;
      pagination?: never;
      /** Request metadata for tracing and diagnostics. */
      meta: RequestMeta;
    };

/**
 * Describe the container used for paginated items
 */
export interface PaginatedData<T> {
  /** Items returned for the current page. */
  items: T[];
}
