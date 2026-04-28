/**
 * High-level error categories used to determine the HTTP status code.
 */
export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'RATE_LIMIT'
  | 'BUSINESS'
  | 'EXTERNAL'
  | 'OVERLOADED'
  | 'INTERNAL';

/**
 * Stable application error codes used across the API.
 */
export type ErrorCode =
  | 'SEAT_UNAVAILABLE'
  | 'SEAT_LOCK_EXPIRED'
  | 'REGISTRATION_DUPLICATE'
  | 'REGISTRATION_NOT_FOUND'
  | 'REGISTRATION_CANCELLED'
  | 'PAYMENT_DUPLICATE'
  | 'PAYMENT_GATEWAY_ERROR'
  | 'PAYMENT_GATEWAY_OPEN'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_ALREADY_SUCCESS'
  | 'WORKSHOP_NOT_FOUND'
  | 'WORKSHOP_NOT_PUBLISHED'
  | 'WORKSHOP_CANCELLED'
  | 'WORKSHOP_FULL'
  | 'WORKSHOP_TIME_CONFLICT'
  | 'TICKET_NOT_FOUND'
  | 'TICKET_VOID'
  | 'TICKET_ALREADY_CHECKEDIN'
  | 'CHECKIN_SCOPE_DENIED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'REFRESH_TOKEN_INVALID'
  | 'USER_NOT_FOUND'
  | 'USER_SUSPENDED'
  | 'STUDENT_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DB_LOCK_TIMEOUT'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

/**
 * Normalized validation issue attached to a specific field.
 */
export interface FieldError {
  /** The field that failed validation. */
  field: string;
  /** The validation rule that failed. */
  rule: string;
  /** Human-readable validation message. */
  message: string;
  /** The raw received value, when available. */
  received?: unknown;
}

/**
 * Internal application error shape used by services and domain logic.
 */
export interface AppError {
  /** High-level error category. */
  category: ErrorCategory;
  /** Stable application error code. */
  code: ErrorCode;
  /** Message describing the failure. */
  message: string;
  /** Optional field-level validation details. */
  fieldErrors?: FieldError[];
  /** Extra structured context for debugging and observability. */
  context?: Record<string, unknown>;
  /** Optional original cause. */
  cause?: unknown;
}

/**
 * Pagination metadata included in paginated API responses.
 */
export interface PaginationMeta {
  /** Current page number. */
  page: number;
  /** Page size. */
  limit: number;
  /** Total number of items. */
  total: number;
  /** Total number of pages. */
  totalPages: number;
  /** Whether there is another page after the current one. */
  hasNextPage: boolean;
  /** Whether there is a page before the current one. */
  hasPrevPage: boolean;
}

/**
 * Metadata attached to every API response.
 */
export interface RequestMeta {
  /** Correlation identifier for the request. */
  requestId: string;
  /** ISO timestamp of when the response was built. */
  timestamp: string;
  /** API version identifier. */
  apiVersion: string;
  /** Optional processing duration in milliseconds. */
  processingMs?: number;
}

/**
 * Public error payload exposed to API clients.
 */
export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldError[];
}

/**
 * Standard API response envelope used by the server.
 */
export type ApiResponse<T = void> =
  | {
      /** Indicates a successful response. */
      success: true;
      /** Response payload. */
      data: T;
      error?: never;
      /** Pagination details for list responses. */
      pagination?: PaginationMeta;
      /** Request metadata. */
      meta: RequestMeta;
    }
  | {
      /** Indicates a failed response. */
      success: false;
      data?: never;
      /** Sanitized error payload. */
      error: ApiErrorShape;
      pagination?: never;
      /** Request metadata. */
      meta: RequestMeta;
    };

/**
 * Container for paginated data items.
 */
export interface PaginatedData<T> {
  /** The list of items on the current page. */
  items: T[];
}
