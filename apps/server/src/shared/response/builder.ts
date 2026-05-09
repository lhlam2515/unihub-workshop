import { randomUUID } from "crypto";

import { categoryToStatus } from "./errors";
import { Result } from "./result";

import type {
  ApiErrorShape,
  ApiResponse,
  AppError,
  PaginatedData,
  PaginationMeta,
  RequestMeta,
} from "./types";

const API_VERSION = "v1";

/**
 * Build standard request metadata for API responses
 *
 * Intended to be used by controllers and interceptors so every response carries
 * a consistent request envelope for tracing.
 *
 * @param requestId - Correlation ID sourced from middleware or headers
 * @param processingStartMs - Request start timestamp used to compute latency
 * @returns Request metadata stamped with timestamp and API version
 * @throws Never. Returns metadata instead of throwing
 */
export const buildMeta = (
  requestId?: string,
  processingStartMs?: number
): RequestMeta => ({
  requestId: requestId ?? randomUUID(),
  timestamp: new Date().toISOString(),
  apiVersion: API_VERSION,
  processingMs:
    typeof processingStartMs === "number"
      ? Date.now() - processingStartMs
      : undefined,
});

/**
 * Sanitize an internal error for client exposure
 *
 * Business rules:
 * - Internal errors always use a generic client message
 * - Internal context and causes are never exposed
 *
 * @param error - Internal error produced by services
 * @returns Client-safe error payload
 * @throws Never. Returns a sanitized object instead of throwing
 */
export const sanitizeError = (error: AppError): ApiErrorShape => ({
  code: error.code,
  message:
    error.category === "INTERNAL"
      ? "An unexpected error occurred. Please try again later."
      : error.message,
  fieldErrors: error.fieldErrors,
});

/**
 * Wrap a payload in a success response envelope
 *
 * @param data - Payload to serialize for the client
 * @param meta - Optional metadata overrides
 * @param meta.requestId - Correlation ID for request tracing
 * @param processingStartMs - Request start timestamp used to compute latency
 * @returns Success response with data and metadata
 * @throws Never. Returns a response envelope instead of throwing
 */
export const successResponse = <T>(
  data: T,
  meta?: Partial<RequestMeta>,
  processingStartMs?: number
): ApiResponse<T> => ({
  success: true,
  data,
  meta: buildMeta(meta?.requestId, processingStartMs),
});

/**
 * Wrap a paginated collection in a success response envelope
 *
 * Business rules:
 * - `hasMore` and `nextCursor` come from the cursor-based pagination result
 * - `total` is only populated for offset-aware admin endpoints
 *
 * @param items - Page items to serialize for the client
 * @param paginationInput - Paging inputs used to calculate pagination metadata
 * @param paginationInput.limit - Page size
 * @param paginationInput.nextCursor - Opaque cursor for the next page
 * @param paginationInput.hasMore - Whether more pages exist
 * @param paginationInput.total - Optional total count for offset-aware endpoints
 * @param meta - Optional metadata overrides
 * @param processingStartMs - Request start timestamp used to compute latency
 * @returns Success response with items and pagination metadata
 * @throws Never. Returns a response envelope instead of throwing
 */
export const paginatedResponse = <T>(
  items: T[],
  paginationInput: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  },
  meta?: Partial<RequestMeta>,
  processingStartMs?: number
): ApiResponse<PaginatedData<T>> => {
  const { limit, nextCursor, hasMore, total } = paginationInput;

  const pagination: PaginationMeta = {
    limit,
    nextCursor,
    hasMore,
    total: total ?? null,
  };

  return {
    success: true,
    data: { data: items },
    pagination,
    meta: buildMeta(meta?.requestId, processingStartMs),
  };
};

/**
 * Wrap an application error in a failure response envelope
 *
 * @param error - Internal error produced by services
 * @param meta - Optional metadata overrides
 * @param meta.requestId - Correlation ID for request tracing
 * @param processingStartMs - Request start timestamp used to compute latency
 * @returns Failure response with sanitized error payload
 * @throws Never. Returns a response envelope instead of throwing
 */
export const errorResponse = (
  error: AppError,
  meta?: Partial<RequestMeta>,
  processingStartMs?: number
): ApiResponse<never> => ({
  success: false,
  error: sanitizeError(error),
  meta: buildMeta(meta?.requestId, processingStartMs),
});

/**
 * Define response mapping options for `Result` conversion
 */
export interface ResultToResponseOptions<T> {
  /** HTTP status code for successful results. */
  successStatus?: number;
  /** Optional transformer for mapping domain data to DTOs. */
  transform?: (data: T) => unknown;
  /** Correlation ID sourced from middleware or headers. */
  requestId?: string;
  /** Request start timestamp used to compute latency. */
  processingStartMs?: number;
}

/**
 * Map a `Result<T>` into HTTP status and response body
 *
 * Business rules:
 * - Success results use `successStatus` or 200 by default
 * - Failure results map categories to status codes
 *
 * @param result - Service result to serialize
 * @param options - Mapping options for status, transform, and metadata
 * @param options.successStatus - Status code used when result is successful
 * @param options.transform - Mapper used to convert domain data to DTOs
 * @param options.requestId - Correlation ID for request tracing
 * @param options.processingStartMs - Request start timestamp used to compute latency
 * @returns Tuple of HTTP status code and response payload
 * @throws Error if `options.transform` throws while mapping data
 */
export const resultToHttpResponse = <T>(
  result: Result<T>,
  options: ResultToResponseOptions<T> = {}
): [number, ApiResponse<unknown>] => {
  const meta: Partial<RequestMeta> = {
    requestId: options.requestId,
    processingMs:
      typeof options.processingStartMs === "number"
        ? Date.now() - options.processingStartMs
        : undefined,
  };

  if (result.isSuccess) {
    const data = options.transform
      ? options.transform(result.data)
      : result.data;
    return [
      options.successStatus ?? 200,
      successResponse(data, meta, options.processingStartMs),
    ];
  }

  return [
    categoryToStatus(result.error.category),
    errorResponse(result.error, meta, options.processingStartMs),
  ];
};

/**
 * Map a paginated `Result` into HTTP status and response body
 *
 * Business rules:
 * - Successful results return a 200 response
 * - Failure results use category-to-status mapping
 *
 * @param result - Result containing items and total count
 * @param pagination - Paging inputs used to calculate pagination metadata
 * @param pagination.page - Current page index
 * @param pagination.limit - Page size used to calculate totals
 * @param requestId - Correlation ID for request tracing
 * @returns Tuple of HTTP status code and response payload
 * @throws Never. Returns a response envelope instead of throwing
 */
export const paginatedResultToHttpResponse = <T>(
  result: Result<{ items: T[] }>,
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  },
  requestId?: string
): [number, ApiResponse<unknown>] => {
  if (result.isFailure) {
    return [
      categoryToStatus(result.error.category),
      errorResponse(result.error, { requestId }),
    ];
  }

  const { items } = result.data;
  return [200, paginatedResponse(items, pagination, { requestId })];
};
