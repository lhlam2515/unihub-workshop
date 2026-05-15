import type { AppError, ErrorCategory, ErrorCode, FieldError } from "./types";

/**
 * Define HTTP status mapping for error categories
 *
 * Business rules:
 * - Each category maps to a single status code across the API
 */
export const CATEGORY_TO_HTTP_STATUS: Record<ErrorCategory, number> = {
  VALIDATION: 400,
  AUTH: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  BUSINESS: 422,
  RATE_LIMIT: 429,
  INTERNAL: 500,
  EXTERNAL: 502,
  OVERLOADED: 503,
};

/**
 * Resolve HTTP status for a category
 *
 * @param category - Error category used by the response builder
 * @returns HTTP status code associated with the category
 * @throws Never. Returns a status code instead of throwing
 */
export const categoryToStatus = (category: ErrorCategory): number =>
  CATEGORY_TO_HTTP_STATUS[category];

/**
 * Describe input used to create a normalized application error
 */
export interface CreateErrorOptions {
  /** Stable error code used by clients and analytics. */
  code: ErrorCode;
  /** Human-readable message for logs and safe client exposure. */
  message: string;
  /** High-level category used for HTTP mapping. */
  category: ErrorCategory;
  /** Optional field-level validation details. */
  fieldErrors?: FieldError[];
  /** Optional internal context for logging and tracing. */
  context?: Record<string, unknown>;
  /** Optional original error preserved for internal diagnostics. */
  cause?: unknown;
  /** Seconds the client should wait before retrying (RFC 7231). */
  retryAfter?: number;
}

/**
 * Create a normalized application error
 *
 * @param options - Error details used to build the payload
 * @param options.code - Stable error code used by clients and analytics
 * @param options.message - Human-readable message for logs and safe clients
 * @param options.category - Category used for HTTP status mapping
 * @param options.fieldErrors - Optional validation details
 * @param options.context - Optional internal context for logging
 * @param options.cause - Optional original error for diagnostics
 * @returns Normalized application error
 * @throws Never. Returns an error object instead of throwing
 */
export const createError = (options: CreateErrorOptions): AppError => ({
  category: options.category,
  code: options.code,
  message: options.message,
  fieldErrors: options.fieldErrors,
  context: options.context,
  cause: options.cause,
  retryAfter: options.retryAfter,
});

/**
 * Group authentication and authorization error factories
 */
export const authErrors = {
  /**
   * Create an error for invalid or malformed access tokens
   *
   * @param cause - Original auth error for internal logging
   * @returns Authentication error payload
   * @throws Never. Returns an error object instead of throwing
   */
  tokenInvalid: (cause?: unknown): AppError =>
    createError({
      category: "AUTH",
      code: "TOKEN_INVALID",
      message: "JWT signature is invalid or malformed.",
      cause,
    }),
  /**
   * Create an error for expired access tokens
   *
   * @returns Authentication error payload
   * @throws Never. Returns an error object instead of throwing
   */
  tokenExpired: (): AppError =>
    createError({
      category: "AUTH",
      code: "TOKEN_EXPIRED",
      message: "Access token has expired. Please refresh.",
    }),
  /**
   * Create an error for revoked tokens
   *
   * @param jti - Token identifier used for revocation tracking
   * @returns Authentication error payload
   * @throws Never. Returns an error object instead of throwing
   */
  tokenRevoked: (jti: string): AppError =>
    createError({
      category: "AUTH",
      code: "TOKEN_REVOKED",
      message: "Token has been revoked.",
      context: { jti },
    }),
  /**
   * Create an error for invalid or expired refresh tokens
   *
   * @param cause - Original auth error for internal logging
   * @returns Authentication error payload
   * @throws Never. Returns an error object instead of throwing
   */
  refreshTokenInvalid: (cause?: unknown): AppError =>
    createError({
      category: "AUTH",
      code: "REFRESH_TOKEN_INVALID",
      message: "Refresh token is invalid or expired.",
      cause,
    }),
  /**
   * Create an error for invalid credentials
   *
   * @returns Authentication error payload
   * @throws Never. Returns an error object instead of throwing
   */
  invalidCredentials: (): AppError =>
    createError({
      category: "AUTH",
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect.",
    }),
  /**
   * Create an error for suspended accounts
   *
   * @param userId - Identifier used for audit and support tooling
   * @returns Authorization error payload
   * @throws Never. Returns an error object instead of throwing
   */
  userSuspended: (userId: string): AppError =>
    createError({
      category: "FORBIDDEN",
      code: "USER_SUSPENDED",
      message: "Account has been suspended.",
      context: { userId },
    }),
  /**
   * Create an error for unauthorized check-in scope
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Authorization error payload
   * @throws Never. Returns an error object instead of throwing
   */
  checkinScopeDenied: (workshopId: string): AppError =>
    createError({
      category: "FORBIDDEN",
      code: "CHECKIN_SCOPE_DENIED",
      message: `Staff is not authorized to check in for workshop ${workshopId}.`,
      context: { workshopId },
    }),
  /**
   * Create an error when a user record is not found
   *
   * @param userId - User identifier used for audit and diagnostics
   * @returns Not found error payload
   * @throws Never. Returns an error object instead of throwing
   */
  userNotFound: (userId?: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "USER_NOT_FOUND",
      message: "User not found.",
      ...(userId ? { context: { userId } } : {}),
    }),
} as const;

/**
 * Group seat availability error factories
 */
export const seatErrors = {
  /**
   * Create an error when no seats remain
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @param decrementedTo - Value after atomic decrement, useful for diagnostics
   * @returns Seat availability error payload
   * @throws Never. Returns an error object instead of throwing
   */
  unavailable: (workshopId: string, decrementedTo?: number): AppError =>
    createError({
      category: "BUSINESS",
      code: "SEAT_UNAVAILABLE",
      message: "No seats available for this workshop.",
      context: { workshopId, decrementedTo },
    }),
  /**
   * Create an error when a seat lock has expired
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @param registrationId - Registration identifier tied to the lock
   * @returns Seat lock error payload
   * @throws Never. Returns an error object instead of throwing
   */
  lockExpired: (workshopId: string, registrationId: string): AppError =>
    createError({
      category: "GONE",
      code: "SEAT_LOCK_EXPIRED",
      message:
        "Your seat hold has expired (15-minute limit). Please register again.",
      context: { workshopId, registrationId },
    }),
} as const;

/**
 * Group registration lifecycle error factories
 */
export const registrationErrors = {
  /**
   * Create an error for duplicate registrations
   *
   * @param studentId - Student identifier used for audit logging
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Registration conflict payload
   * @throws Never. Returns an error object instead of throwing
   */
  duplicate: (studentId: string, workshopId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "REGISTRATION_DUPLICATE",
      message: "You have already registered for this workshop.",
      context: { studentId, workshopId },
    }),
  /**
   * Create an error when a registration is missing
   *
   * @param registrationId - Registration identifier used for audit logging
   * @returns Registration not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (registrationId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "REGISTRATION_NOT_FOUND",
      message: `Registration ${registrationId} not found.`,
      context: { registrationId },
    }),
  /**
   * Create an error when a registration was already cancelled
   *
   * @param registrationId - Registration identifier used for audit logging
   * @returns Registration conflict payload
   * @throws Never. Returns an error object instead of throwing
   */
  alreadyCancelled: (registrationId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "REGISTRATION_CANCELLED",
      message: "This registration has already been cancelled.",
      context: { registrationId },
    }),
} as const;

/**
 * Group payment workflow error factories
 */
export const paymentErrors = {
  /**
   * Create an error for duplicate idempotent payments
   *
   * @param idempotencyKey - Idempotency key associated with the request
   * @param existingPaymentId - Existing payment identifier to return to clients
   * @returns Payment conflict payload
   * @throws Never. Returns an error object instead of throwing
   */
  duplicate: (idempotencyKey: string, existingPaymentId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "PAYMENT_DUPLICATE",
      message: "A payment with this idempotency key already exists.",
      context: { idempotencyKey, existingPaymentId },
    }),
  /**
   * Create an error when payment is already successful
   *
   * @param paymentId - Payment identifier used for audit logging
   * @returns Payment conflict payload
   * @throws Never. Returns an error object instead of throwing
   */
  alreadySuccess: (paymentId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "PAYMENT_ALREADY_SUCCESS",
      message: "Payment has already been successfully completed.",
      context: { paymentId },
    }),
  /**
   * Create an error when the payment gateway circuit is open
   *
   * @param gateway - External gateway identifier
   * @param openedAt - Timestamp used for circuit breaker diagnostics
   * @returns Overload error payload
   * @throws Never. Returns an error object instead of throwing
   */
  gatewayOpen: (gateway: string, openedAt: string): AppError =>
    createError({
      category: "OVERLOADED",
      code: "PAYMENT_GATEWAY_OPEN",
      message:
        "Hệ thống thanh toán tạm thời gián đoạn. Vui lòng thử lại sau ~30 giây.",
      context: { gateway, openedAt },
      retryAfter: 30,
    }),
  /**
   * Create an error for gateway failures
   *
   * @param gateway - External gateway identifier
   * @param cause - Original gateway error for internal logging
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  gatewayError: (gateway: string, cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "PAYMENT_GATEWAY_ERROR",
      message: "Payment gateway returned an error. Please try again.",
      context: { gateway },
      cause,
    }),
  /**
   * Create an error for gateway timeouts
   *
   * @param gateway - External gateway identifier
   * @param paymentId - Payment identifier used for audit logging
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  timeout: (gateway: string, paymentId: string): AppError =>
    createError({
      category: "EXTERNAL",
      code: "PAYMENT_TIMEOUT",
      message:
        "Payment gateway did not respond in time. Your payment status will be confirmed shortly.",
      context: { gateway, paymentId },
    }),
  /**
   * Create an error when a payment record is missing
   *
   * @param paymentId - Payment identifier used for audit logging
   * @returns Payment not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (paymentId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "PAYMENT_NOT_FOUND",
      message: `Payment ${paymentId} not found.`,
      context: { paymentId },
    }),
} as const;

/**
 * Group workshop-related error factories
 */
export const workshopErrors = {
  /**
   * Create an error when a workshop is missing
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Workshop not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (workshopId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "WORKSHOP_NOT_FOUND",
      message: `Workshop ${workshopId} not found.`,
      context: { workshopId },
    }),
  /**
   * Create an error when a workshop is not published
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @param status - Publication status used for diagnostics
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  notPublished: (workshopId: string, status: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "WORKSHOP_NOT_PUBLISHED",
      message: "This workshop is not available for registration.",
      context: { workshopId, status },
    }),
  /**
   * Create an error when trying to publish an already-published workshop
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  alreadyPublished: (workshopId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "WORKSHOP_ALREADY_PUBLISHED",
      message: "This workshop is already published.",
      context: { workshopId },
    }),
  /**
   * Create an error when a workshop is cancelled
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  cancelled: (workshopId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "WORKSHOP_CANCELLED",
      message: "This workshop has been cancelled.",
      context: { workshopId },
    }),
  /**
   * Create an error when a workshop is fully booked
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  full: (workshopId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "WORKSHOP_FULL",
      message: "This workshop is fully booked.",
      context: { workshopId },
    }),
  /**
   * Create an error when a room is already booked
   *
   * @param roomId - Room identifier used for audit logging
   * @param startsAt - Start timestamp for the conflicting booking
   * @param endsAt - End timestamp for the conflicting booking
   * @returns Conflict error payload
   * @throws Never. Returns an error object instead of throwing
   */
  roomConflict: (roomId: string, startsAt: string, endsAt: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "WORKSHOP_TIME_CONFLICT",
      message: "The room is already booked for the selected time slot.",
      context: { roomId, startsAt, endsAt },
    }),
} as const;

/**
 * Group check-in validation error factories
 */
export const checkinErrors = {
  /**
   * Create an error when a QR code is unknown
   *
   * @param qrCode - Scanned QR code used for audit logging
   * @returns QR not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  qrInvalid: (qrCode: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "QR_INVALID",
      message: "QR code does not match any registration.",
      context: { qrCode },
    }),
  /**
   * Create an error when a registration status is not eligible for check-in
   *
   * @param registrationId - Registration identifier used for audit logging
   * @returns Forbidden error payload
   * @throws Never. Returns an error object instead of throwing
   */
  registrationNotActive: (registrationId: string): AppError =>
    createError({
      category: "FORBIDDEN",
      code: "REGISTRATION_NOT_ACTIVE",
      message: "Registration status must be PAID or CONFIRMED for check-in.",
      context: { registrationId },
    }),
  /**
   * Create an error when a QR code belongs to a different workshop
   *
   * @param registrationId - Registration identifier used for audit logging
   * @param workshopId - Expected workshop identifier
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  wrongWorkshop: (registrationId: string, workshopId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "WRONG_WORKSHOP",
      message: "QR code is valid but for a different workshop.",
      context: { registrationId, workshopId },
    }),
  /**
   * Create an error when a registration is already checked in
   *
   * @param registrationId - Registration identifier used for audit logging
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Conflict error payload
   * @throws Never. Returns an error object instead of throwing
   */
  alreadyCheckedIn: (registrationId: string, workshopId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "TICKET_ALREADY_CHECKEDIN",
      message: "This registration has already been used for check-in.",
      context: { registrationId, workshopId },
    }),
  /**
   * Create an error when a sync batch exceeds the maximum item count
   *
   * @param limit - Maximum allowed items per batch
   * @returns Validation error payload
   * @throws Never. Returns an error object instead of throwing
   */
  batchTooLarge: (limit: number): AppError =>
    createError({
      category: "VALIDATION",
      code: "BATCH_TOO_LARGE",
      message: `Sync batch exceeds maximum of ${limit} items.`,
      context: { limit },
    }),
  /**
   * Create an error when a staff is not assigned to the workshop
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Forbidden error payload
   * @throws Never. Returns an error object instead of throwing
   */
  workshopNotAssigned: (workshopId: string): AppError =>
    createError({
      category: "FORBIDDEN",
      code: "WORKSHOP_NOT_ASSIGNED",
      message: "Staff is not authorized for this workshop.",
      context: { workshopId },
    }),
  /**
   * Create an error when a workshop is cancelled
   *
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Conflict error payload
   * @throws Never. Returns an error object instead of throwing
   */
  workshopCancelled: (workshopId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "WORKSHOP_CANCELLED",
      message: "Workshop has been cancelled.",
      context: { workshopId },
    }),
  /**
   * Create an error when a client-provided timestamp is invalid
   *
   * @param field - Field name with the invalid timestamp
   * @returns Validation error payload
   * @throws Never. Returns an error object instead of throwing
   */
  invalidTimestamp: (field: string): AppError =>
    createError({
      category: "VALIDATION",
      code: "INVALID_TIMESTAMP",
      message: `Invalid timestamp provided for ${field}.`,
      context: { field },
    }),
} as const;

/**
 * Create a validation error with field-level details
 *
 * @param fieldErrors - Field failures returned by validation logic
 * @returns Validation error payload
 * @throws Never. Returns an error object instead of throwing
 */
export const validationError = (fieldErrors: FieldError[]): AppError =>
  createError({
    category: "VALIDATION",
    code: "VALIDATION_FAILED",
    message: "Validation failed.",
    fieldErrors,
  });

/**
 * Create a rate limit error for throttled requests
 *
 * @param limit - Request limit enforced by the throttling policy
 * @param retryAfterSeconds - Suggested retry delay in seconds
 * @returns Rate limit error payload
 * @throws Never. Returns an error object instead of throwing
 */
export const rateLimitError = (
  limit: number,
  retryAfterSeconds: number,
  tier: string
): AppError =>
  createError({
    category: "RATE_LIMIT",
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please try again later.",
    context: { limit, retryAfterSeconds, tier },
  });

/**
 * Create a concurrency conflict error for optimistic locking version mismatches
 *
 * @param resource - Resource type that was modified (e.g. "Workshop")
 * @param id - Unique identifier of the modified resource
 * @param expectedVersion - Version expected by the client that caused the conflict
 * @returns Conflict error payload
 * @throws Never. Returns an error object instead of throwing
 */
export const concurrentModification = (
  resource: string,
  id: string,
  expectedVersion: number
): AppError =>
  createError({
    category: "CONFLICT",
    code: "CONCURRENT_MODIFICATION",
    message: `${resource} has been modified by another request. Please refresh and try again.`,
    context: { resource, id, expectedVersion },
  });

/**
 * Create an idempotency conflict error when a request with the same key is in progress
 *
 * @param key - Idempotency key that caused the conflict
 * @returns Conflict error payload
 * @throws Never. Returns an error object instead of throwing
 */
export const idempotencyConflict = (key: string): AppError =>
  createError({
    category: "CONFLICT",
    code: "IDEMPOTENCY_CONFLICT",
    message: "A request with this idempotency key is already in progress.",
    context: { idempotencyKey: key },
  });

/**
 * Group device token error factories
 */
export const deviceTokenErrors = {
  /**
   * Create an error when a device token is not found
   *
   * @param token - Device token value that was looked up
   * @returns Not found error payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (token: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "DEVICE_TOKEN_NOT_FOUND",
      message: "Device token not found or already deactivated.",
      context: { token },
    }),
  /**
   * Create an error when a caller tries to modify another user's device token
   *
   * @param token - Device token value that caused the violation
   * @returns Forbidden error payload
   * @throws Never. Returns an error object instead of throwing
   */
  ownershipMismatch: (token: string): AppError =>
    createError({
      category: "FORBIDDEN",
      code: "CHECKIN_SCOPE_DENIED",
      message: "Device token does not belong to the current user.",
      context: { token },
    }),
} as const;

/**
 * Group storage error factories for S3-compatible object storage operations
 */
export const storageErrors = {
  /**
   * Create an error when file upload to object storage fails
   *
   * @param cause - Original S3 error for internal diagnostics
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  uploadFailed: (cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "UPLOAD_FAILED",
      message: "File upload to storage service failed.",
      cause,
    }),
  /**
   * Create an error when file deletion from object storage fails
   *
   * @param cause - Original S3 error for internal diagnostics
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  deleteFailed: (cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "DELETE_FAILED",
      message: "File deletion from storage service failed.",
      cause,
    }),

  /**
   * Create an error when a file is not found in object storage.
   *
   * @param key - The storage key that was requested.
   * @returns Not found error payload.
   * @throws Never. Returns an error object instead of throwing.
   */
  fileNotFound: (key: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "STORAGE_FILE_NOT_FOUND",
      message: `File not found in storage: ${key}.`,
      context: { key },
    }),

  /**
   * Create an error when downloading a file from storage fails.
   *
   * @param cause - Original S3 error for internal diagnostics.
   * @returns External dependency error payload.
   * @throws Never. Returns an error object instead of throwing.
   */
  downloadFailed: (cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "STORAGE_DOWNLOAD_FAILED",
      message: "Failed to download file from storage service.",
      cause,
    }),
} as const;

/**
 * Group room error factories
 */
export const roomErrors = {
  /**
   * Create an error when a room is missing
   *
   * @param roomId - Room identifier used for audit logging
   * @returns Room not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (roomId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "ROOM_NOT_FOUND",
      message: `Room ${roomId} not found.`,
      context: { roomId },
    }),
} as const;

/**
 * Group speaker error factories
 */
export const speakerErrors = {
  /**
   * Create an error when a speaker is missing
   *
   * @param speakerId - Speaker identifier used for audit logging
   * @returns Speaker not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (speakerId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "SPEAKER_NOT_FOUND",
      message: `Speaker ${speakerId} not found.`,
      context: { speakerId },
    }),
} as const;

/**
 * Group notification error factories
 */
export const notificationErrors = {
  /**
   * Create an error when a notification log is missing
   *
   * @param notificationId - Notification identifier used for audit logging
   * @returns Notification not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  logNotFound: (notificationId: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "NOTIFICATION_LOG_NOT_FOUND",
      message: `Notification log ${notificationId} not found.`,
      context: { notificationId },
    }),
  /**
   * Create an error when channel configuration is missing
   *
   * @param channelType - Channel type identifier used for diagnostics
   * @returns Channel config not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  channelConfigNotFound: (channelType: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND",
      message: `Channel configuration for ${channelType} not found.`,
      context: { channelType },
    }),
  /**
   * Create an error when a channel is not active
   *
   * @param channelType - Channel type identifier used for diagnostics
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  channelInactive: (channelType: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "NOTIFICATION_CHANNEL_INACTIVE",
      message: `Channel ${channelType} is not active.`,
      context: { channelType },
    }),
  /**
   * Create an error for an unknown channel type
   *
   * @param channelType - Unrecognized channel type identifier
   * @returns Validation error payload
   * @throws Never. Returns an error object instead of throwing
   */
  channelUnknown: (channelType: string): AppError =>
    createError({
      category: "VALIDATION",
      code: "NOTIFICATION_CHANNEL_UNKNOWN",
      message: `Unknown notification channel: ${channelType}.`,
      context: { channelType },
    }),
  channelTimeout: (channelType: string, timeoutMs: number): AppError =>
    createError({
      category: "EXTERNAL",
      code: "NOTIFICATION_CHANNEL_TIMEOUT",
      message: `Channel ${channelType} timed out after ${timeoutMs}ms.`,
      context: { channelType, timeoutMs },
    }),
} as const;

/**
 * Group AI summary pipeline error factories
 */
export const aiSummaryErrors = {
  /**
   * Create an error when PDF text extraction fails
   *
   * @param cause - Original extraction error for internal diagnostics
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  pdfExtractionFailed: (cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "PDF_EXTRACTION_FAILED",
      message: "Failed to extract text from PDF document.",
      cause,
    }),
  /**
   * Create an error when the LLM call times out
   *
   * @param modelUsed - AI model identifier used for diagnostics
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  llmTimeout: (modelUsed: string): AppError =>
    createError({
      category: "EXTERNAL",
      code: "LLM_TIMEOUT",
      message: "AI summarisation timed out. The document may be too long.",
      context: { modelUsed },
    }),
  /**
   * Create an error when the LLM API returns an error
   *
   * @param modelUsed - AI model identifier used for diagnostics
   * @param cause - Original API error for internal logging
   * @returns External dependency error payload
   * @throws Never. Returns an error object instead of throwing
   */
  llmApiError: (modelUsed: string, cause?: unknown): AppError =>
    createError({
      category: "EXTERNAL",
      code: "LLM_API_ERROR",
      message: "AI summarisation service returned an error.",
      context: { modelUsed },
      cause,
    }),
  /**
   * Create an error when retrying an AI summary that is not in FAILED status.
   *
   * Business rule: only FAILED summaries are eligible for retry.
   *
   * @param workshopId - The workshop whose summary retry was rejected.
   * @returns Business error payload.
   */
  retryNotAllowed: (workshopId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "AI_SUMMARY_RETRY_NOT_ALLOWED",
      message: "AI summary can only be retried when status is FAILED.",
      context: { workshopId },
    }),
} as const;

/**
 * Group system-level error factories
 */
export const systemErrors = {
  /**
   * Create a catch-all internal error
   *
   * @param cause - Original error for internal logging
   * @returns Internal error payload
   * @throws Never. Returns an error object instead of throwing
   */
  internal: (cause?: unknown): AppError =>
    createError({
      category: "INTERNAL",
      code: "INTERNAL_ERROR",
      message: "An unexpected internal error occurred.",
      cause,
    }),
  /**
   * Create an error when the system is overloaded
   *
   * @param resource - Resource under contention
   * @param timeoutMs - Timeout value used for diagnostics
   * @returns Overload error payload
   * @throws Never. Returns an error object instead of throwing
   */
  dbLockTimeout: (resource: string, timeoutMs: number): AppError =>
    createError({
      category: "OVERLOADED",
      code: "DB_LOCK_TIMEOUT",
      message: "The system is temporarily overloaded. Please try again.",
      context: { resource, timeoutMs },
    }),
} as const;

/**
 * Checks whether an unknown value is a normalized AppError.
 *
 * @param err - The value to check.
 * @returns Whether the value is an AppError (has code and category properties).
 */
export const isAppError = (err: unknown): err is AppError =>
  typeof err === "object" && err !== null && "code" in err && "category" in err;

/**
 * Passes through AppError values as-is, wraps everything else as INTERNAL_ERROR.
 *
 * Intended for use as the error mapper in tryCatch when the callback may throw
 * a domain AppError (e.g., Drizzle transaction throw-to-rollback):
 * `tryCatch(fn, passthroughOrInternal)`
 *
 * @param err - The error to map.
 * @returns AppError unchanged, or a new INTERNAL_ERROR wrapping non-AppError values.
 */
export const passthroughOrInternal = (err: unknown): AppError =>
  isAppError(err) ? err : systemErrors.internal(err);

/**
 * Creates an error mapper for FOR UPDATE NOWAIT lock-timeout detection.
 *
 * Detects PostgreSQL lock conflict errors and maps them to DB_LOCK_TIMEOUT.
 * Any other error is wrapped as INTERNAL_ERROR.
 *
 * @param resource - Resource name for the DB_LOCK_TIMEOUT context (e.g., "payments", "registrations").
 * @param timeoutMs - Timeout in milliseconds (default 3000).
 * @returns An error mapper function suitable for tryCatch.
 */
export const lockTimeoutMapper =
  (resource: string, timeoutMs = 3000) =>
  (err: unknown): AppError => {
    if (
      String(err).includes("could not obtain lock") ||
      String(err).includes("NOWAIT")
    ) {
      return systemErrors.dbLockTimeout(resource, timeoutMs);
    }
    return systemErrors.internal(err);
  };
