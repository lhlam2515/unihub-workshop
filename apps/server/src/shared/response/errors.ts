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
        "Payment service is temporarily unavailable. Your booking is saved - please try again in a few minutes.",
      context: { gateway, openedAt },
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
 * Group ticket validation error factories
 */
export const ticketErrors = {
  /**
   * Create an error when a ticket token is unknown
   *
   * @param qrToken - Scanned token identifier used for audit logging
   * @returns Ticket not found payload
   * @throws Never. Returns an error object instead of throwing
   */
  notFound: (qrToken: string): AppError =>
    createError({
      category: "NOT_FOUND",
      code: "TICKET_NOT_FOUND",
      message: "QR code does not match any ticket.",
      context: { qrToken },
    }),
  /**
   * Create an error when a ticket is voided
   *
   * @param ticketId - Ticket identifier used for audit logging
   * @returns Business rule error payload
   * @throws Never. Returns an error object instead of throwing
   */
  void: (ticketId: string): AppError =>
    createError({
      category: "BUSINESS",
      code: "TICKET_VOID",
      message: "This ticket has been voided and is no longer valid.",
      context: { ticketId },
    }),
  /**
   * Create an error when a ticket is already checked in
   *
   * @param ticketId - Ticket identifier used for audit logging
   * @param workshopId - Workshop identifier used for audit logging
   * @returns Conflict error payload
   * @throws Never. Returns an error object instead of throwing
   */
  alreadyCheckedIn: (ticketId: string, workshopId: string): AppError =>
    createError({
      category: "CONFLICT",
      code: "TICKET_ALREADY_CHECKEDIN",
      message: "This ticket has already been used for check-in.",
      context: { ticketId, workshopId },
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
  retryAfterSeconds: number
): AppError =>
  createError({
    category: "RATE_LIMIT",
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please try again later.",
    context: { limit, retryAfterSeconds },
  });

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
