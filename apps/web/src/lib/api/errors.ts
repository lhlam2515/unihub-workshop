import type { ApiErrorShape, ErrorCode, FieldError } from "./types";

// ---------------------------------------------------------------------------
// ApiError – structured error thrown by the client for failed responses
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by the API client whenever the server returns
 * `success: false` or the request fails at the network / HTTP level.
 *
 * Consumers can use `instanceof ApiError` checks and inspect `code` for
 * fine-grained handling without parsing raw HTTP responses.
 */
export class ApiError extends Error {
  /** Stable machine-readable code mirroring the server's `ErrorCode`. */
  public readonly code: ErrorCode;

  /** HTTP status code of the failed response (0 when network-level failure). */
  public readonly status: number;

  /** Optional field-level details for validation errors. */
  public readonly fieldErrors?: FieldError[];

  /** Seconds the client should wait before retrying (RFC 7231). */
  public readonly retryAfter?: number;

  /**
   * Construct an `ApiError` from the server error payload.
   *
   * @param status - HTTP status code of the response
   * @param payload - Sanitized error shape from the response envelope
   */
  constructor(status: number, payload: ApiErrorShape) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.status = status;
    this.fieldErrors = payload.fieldErrors;
    this.retryAfter = payload.retryAfter;
    // Fix prototype chain for `instanceof` checks in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Predicate helpers
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown thrown value to `ApiError`.
 *
 * @example
 * ```ts
 * try {
 *   await api.get('/workshops');
 * } catch (err) {
 *   if (isApiError(err)) {
 *     toast.error(err.message);
 *   }
 * }
 * ```
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Return `true` when the error represents an authentication failure
 * that should trigger a token refresh or forced logout.
 *
 * Covers `TOKEN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_REVOKED`, and
 * `REFRESH_TOKEN_INVALID`.
 */
export function isAuthError(err: unknown): err is ApiError {
  if (!isApiError(err)) return false;
  return (
    err.code === "TOKEN_EXPIRED" ||
    err.code === "TOKEN_INVALID" ||
    err.code === "TOKEN_REVOKED" ||
    err.code === "REFRESH_TOKEN_INVALID"
  );
}

/**
 * Return `true` when the error represents a failed refresh token —
 * the user must be forced to log out.
 */
export function isRefreshTokenError(err: unknown): err is ApiError {
  return isApiError(err) && err.code === "REFRESH_TOKEN_INVALID";
}

/**
 * Return `true` for validation errors that carry field-level details.
 */
export function isValidationError(err: unknown): err is ApiError {
  return isApiError(err) && err.code === "VALIDATION_FAILED";
}

/**
 * Return `true` for business-rule violations (HTTP 422).
 */
export function isBusinessError(err: unknown): err is ApiError {
  return isApiError(err) && err.status === 422;
}
