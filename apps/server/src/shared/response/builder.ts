import { randomUUID } from 'crypto';

import { categoryToStatus } from './errors';
import { Result } from './result';

import type {
  ApiErrorShape,
  ApiResponse,
  AppError,
  PaginatedData,
  PaginationMeta,
  RequestMeta,
} from './types';

const API_VERSION = 'v1';

/**
 * Builds the standard request metadata object for API responses.
 */
export const buildMeta = (
  requestId?: string,
  processingStartMs?: number
): RequestMeta => ({
  requestId: requestId ?? randomUUID(),
  timestamp: new Date().toISOString(),
  apiVersion: API_VERSION,
  processingMs:
    typeof processingStartMs === 'number'
      ? Date.now() - processingStartMs
      : undefined,
});

/**
 * Converts an internal `AppError` into the public `ApiErrorShape`.
 */
export const sanitizeError = (error: AppError): ApiErrorShape => ({
  code: error.code,
  message:
    error.category === 'INTERNAL'
      ? 'An unexpected error occurred. Please try again later.'
      : error.message,
  fieldErrors: error.fieldErrors,
});

/**
 * Builds a success response for a single resource or payload.
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
 * Builds a success response for paginated collections.
 */
export const paginatedResponse = <T>(
  items: T[],
  paginationInput: { page: number; limit: number; total: number },
  meta?: Partial<RequestMeta>,
  processingStartMs?: number
): ApiResponse<PaginatedData<T>> => {
  const { page, limit, total } = paginationInput;
  const totalPages = Math.ceil(total / limit);

  const pagination: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return {
    success: true,
    data: { items },
    pagination,
    meta: buildMeta(meta?.requestId, processingStartMs),
  };
};

/**
 * Builds an error response from an `AppError`.
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
 * Configuration used to map a `Result` instance into an HTTP response.
 */
export interface ResultToResponseOptions<T> {
  successStatus?: number;
  transform?: (data: T) => unknown;
  requestId?: string;
  processingStartMs?: number;
}

/**
 * Converts a `Result<T>` into a tuple of `[httpStatus, ApiResponse]`.
 */
export const resultToHttpResponse = <T>(
  result: Result<T>,
  options: ResultToResponseOptions<T> = {}
): [number, ApiResponse<unknown>] => {
  const meta: Partial<RequestMeta> = {
    requestId: options.requestId,
    processingMs:
      typeof options.processingStartMs === 'number'
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
 * Converts a paginated `Result` into an HTTP response tuple.
 */
export const paginatedResultToHttpResponse = <T>(
  result: Result<{ items: T[]; total: number }>,
  pagination: { page: number; limit: number },
  requestId?: string
): [number, ApiResponse<unknown>] => {
  if (result.isFailure) {
    return [
      categoryToStatus(result.error.category),
      errorResponse(result.error, { requestId }),
    ];
  }

  const { items, total } = result.data;
  return [
    200,
    paginatedResponse(items, { ...pagination, total }, { requestId }),
  ];
};
