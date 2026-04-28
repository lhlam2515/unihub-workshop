import type { AppError, ErrorCategory, ErrorCode, FieldError } from './types';

/**
 * Maps each error category to the HTTP status code returned by the API.
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
 * Resolves the HTTP status code for a given error category.
 */
export const categoryToStatus = (category: ErrorCategory): number =>
  CATEGORY_TO_HTTP_STATUS[category];

/**
 * Input used to create a normalized `AppError`.
 */
export interface CreateErrorOptions {
  code: ErrorCode;
  message: string;
  category: ErrorCategory;
  fieldErrors?: FieldError[];
  context?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Creates a normalized `AppError` object.
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
 * Predefined authentication and authorization errors.
 */
export const authErrors = {
  tokenInvalid: (cause?: unknown): AppError =>
    createError({
      category: 'AUTH',
      code: 'TOKEN_INVALID',
      message: 'JWT signature is invalid or malformed.',
      cause,
    }),
  tokenExpired: (): AppError =>
    createError({
      category: 'AUTH',
      code: 'TOKEN_EXPIRED',
      message: 'Access token has expired. Please refresh.',
    }),
  tokenRevoked: (jti: string): AppError =>
    createError({
      category: 'AUTH',
      code: 'TOKEN_REVOKED',
      message: 'Token has been revoked.',
      context: { jti },
    }),
  refreshTokenInvalid: (cause?: unknown): AppError =>
    createError({
      category: 'AUTH',
      code: 'REFRESH_TOKEN_INVALID',
      message: 'Refresh token is invalid or expired.',
      cause,
    }),
  invalidCredentials: (): AppError =>
    createError({
      category: 'AUTH',
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    }),
  userSuspended: (userId: string): AppError =>
    createError({
      category: 'FORBIDDEN',
      code: 'USER_SUSPENDED',
      message: 'Account has been suspended.',
      context: { userId },
    }),
  checkinScopeDenied: (workshopId: string): AppError =>
    createError({
      category: 'FORBIDDEN',
      code: 'CHECKIN_SCOPE_DENIED',
      message: `Staff is not authorized to check in for workshop ${workshopId}.`,
      context: { workshopId },
    }),
} as const;

/**
 * Predefined seat availability errors.
 */
export const seatErrors = {
  unavailable: (workshopId: string, decrementedTo?: number): AppError =>
    createError({
      category: 'BUSINESS',
      code: 'SEAT_UNAVAILABLE',
      message: 'No seats available for this workshop.',
      context: { workshopId, decrementedTo },
    }),
  lockExpired: (workshopId: string, registrationId: string): AppError =>
    createError({
      category: 'GONE',
      code: 'SEAT_LOCK_EXPIRED',
      message:
        'Your seat hold has expired (15-minute limit). Please register again.',
      context: { workshopId, registrationId },
    }),
} as const;

/**
 * Predefined registration lifecycle errors.
 */
export const registrationErrors = {
  duplicate: (studentId: string, workshopId: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'REGISTRATION_DUPLICATE',
      message: 'You have already registered for this workshop.',
      context: { studentId, workshopId },
    }),
  notFound: (registrationId: string): AppError =>
    createError({
      category: 'NOT_FOUND',
      code: 'REGISTRATION_NOT_FOUND',
      message: `Registration ${registrationId} not found.`,
      context: { registrationId },
    }),
  alreadyCancelled: (registrationId: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'REGISTRATION_CANCELLED',
      message: 'This registration has already been cancelled.',
      context: { registrationId },
    }),
} as const;

/**
 * Predefined payment workflow errors.
 */
export const paymentErrors = {
  duplicate: (idempotencyKey: string, existingPaymentId: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'PAYMENT_DUPLICATE',
      message: 'A payment with this idempotency key already exists.',
      context: { idempotencyKey, existingPaymentId },
    }),
  alreadySuccess: (paymentId: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'PAYMENT_ALREADY_SUCCESS',
      message: 'Payment has already been successfully completed.',
      context: { paymentId },
    }),
  gatewayOpen: (gateway: string, openedAt: string): AppError =>
    createError({
      category: 'OVERLOADED',
      code: 'PAYMENT_GATEWAY_OPEN',
      message:
        'Payment service is temporarily unavailable. Your booking is saved - please try again in a few minutes.',
      context: { gateway, openedAt },
    }),
  gatewayError: (gateway: string, cause?: unknown): AppError =>
    createError({
      category: 'EXTERNAL',
      code: 'PAYMENT_GATEWAY_ERROR',
      message: 'Payment gateway returned an error. Please try again.',
      context: { gateway },
      cause,
    }),
  timeout: (gateway: string, paymentId: string): AppError =>
    createError({
      category: 'EXTERNAL',
      code: 'PAYMENT_TIMEOUT',
      message:
        'Payment gateway did not respond in time. Your payment status will be confirmed shortly.',
      context: { gateway, paymentId },
    }),
  notFound: (paymentId: string): AppError =>
    createError({
      category: 'NOT_FOUND',
      code: 'PAYMENT_NOT_FOUND',
      message: `Payment ${paymentId} not found.`,
      context: { paymentId },
    }),
} as const;

/**
 * Predefined workshop-related errors.
 */
export const workshopErrors = {
  notFound: (workshopId: string): AppError =>
    createError({
      category: 'NOT_FOUND',
      code: 'WORKSHOP_NOT_FOUND',
      message: `Workshop ${workshopId} not found.`,
      context: { workshopId },
    }),
  notPublished: (workshopId: string, status: string): AppError =>
    createError({
      category: 'BUSINESS',
      code: 'WORKSHOP_NOT_PUBLISHED',
      message: 'This workshop is not available for registration.',
      context: { workshopId, status },
    }),
  cancelled: (workshopId: string): AppError =>
    createError({
      category: 'BUSINESS',
      code: 'WORKSHOP_CANCELLED',
      message: 'This workshop has been cancelled.',
      context: { workshopId },
    }),
  full: (workshopId: string): AppError =>
    createError({
      category: 'BUSINESS',
      code: 'WORKSHOP_FULL',
      message: 'This workshop is fully booked.',
      context: { workshopId },
    }),
  roomConflict: (roomId: string, startsAt: string, endsAt: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'WORKSHOP_TIME_CONFLICT',
      message: 'The room is already booked for the selected time slot.',
      context: { roomId, startsAt, endsAt },
    }),
} as const;

/**
 * Predefined ticket validation errors.
 */
export const ticketErrors = {
  notFound: (qrToken: string): AppError =>
    createError({
      category: 'NOT_FOUND',
      code: 'TICKET_NOT_FOUND',
      message: 'QR code does not match any ticket.',
      context: { qrToken },
    }),
  void: (ticketId: string): AppError =>
    createError({
      category: 'BUSINESS',
      code: 'TICKET_VOID',
      message: 'This ticket has been voided and is no longer valid.',
      context: { ticketId },
    }),
  alreadyCheckedIn: (ticketId: string, workshopId: string): AppError =>
    createError({
      category: 'CONFLICT',
      code: 'TICKET_ALREADY_CHECKEDIN',
      message: 'This ticket has already been used for check-in.',
      context: { ticketId, workshopId },
    }),
} as const;

/**
 * Creates a validation error with field-level details.
 */
export const validationError = (fieldErrors: FieldError[]): AppError =>
  createError({
    category: 'VALIDATION',
    code: 'VALIDATION_FAILED',
    message: 'Validation failed.',
    fieldErrors,
  });

/**
 * Creates a rate limit error for request throttling scenarios.
 */
export const rateLimitError = (
  limit: number,
  retryAfterSeconds: number
): AppError =>
  createError({
    category: 'RATE_LIMIT',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
    context: { limit, retryAfterSeconds },
  });

/**
 * Predefined system-level errors.
 */
export const systemErrors = {
  internal: (cause?: unknown): AppError =>
    createError({
      category: 'INTERNAL',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
      cause,
    }),
  dbLockTimeout: (resource: string, timeoutMs: number): AppError =>
    createError({
      category: 'OVERLOADED',
      code: 'DB_LOCK_TIMEOUT',
      message: 'The system is temporarily overloaded. Please try again.',
      context: { resource, timeoutMs },
    }),
} as const;
