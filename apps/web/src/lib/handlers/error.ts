import { isApiError } from "@/lib/api/errors";
import type {
  ApiErrorShape,
  ApiResponse,
  ErrorCode,
  FieldError,
} from "@/lib/api/types";
import logger from "@/lib/logger";

export type ActionResponse<T = null> = {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: ErrorCode;
    details?: Record<string, string[]>;
  };
};

const UNKNOWN_ERROR_MESSAGE = "Đã xảy ra lỗi không mong muốn";

type FailedApiResponse = Extract<ApiResponse<unknown>, { success: false }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorShape(value: unknown): value is ApiErrorShape {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === "string" && typeof value.message === "string";
}

function isFailedApiResponse(value: unknown): value is FailedApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  return value.success === false && isApiErrorShape(value.error);
}

function toErrorDetails(
  fieldErrors?: FieldError[]
): Record<string, string[]> | undefined {
  if (!fieldErrors?.length) {
    return undefined;
  }

  return fieldErrors.reduce<Record<string, string[]>>((acc, current) => {
    if (!acc[current.field]) {
      acc[current.field] = [];
    }

    acc[current.field].push(current.message);
    return acc;
  }, {});
}

function toFailure(
  message: string,
  code?: ErrorCode,
  fieldErrors?: FieldError[]
): ActionResponse<null> {
  return {
    success: false,
    error: {
      message,
      code,
      details: toErrorDetails(fieldErrors),
    },
  };
}

/**
 * Normalize all error sources (ApiError, failed ApiResponse, unknown exceptions)
 * into a single ActionResponse shape consumable by Server Actions.
 */
export function handleError(error: unknown): ActionResponse<null> {
  if (isApiError(error)) {
    const log =
      error.status >= 500 || error.status === 0 ? logger.error : logger.warn;

    log(
      {
        code: error.code,
        status: error.status,
        fieldErrors: error.fieldErrors,
      },
      `ApiError: ${error.message}`
    );

    return toFailure(error.message, error.code, error.fieldErrors);
  }

  if (isFailedApiResponse(error)) {
    logger.warn(
      {
        code: error.error.code,
        fieldErrors: error.error.fieldErrors,
      },
      `ApiResponse error: ${error.error.message}`
    );

    return toFailure(
      error.error.message,
      error.error.code,
      error.error.fieldErrors
    );
  }

  if (isApiErrorShape(error)) {
    logger.warn({ code: error.code }, `ApiErrorShape: ${error.message}`);
    return toFailure(error.message, error.code, error.fieldErrors);
  }

  if (error instanceof Error) {
    logger.error({ err: error }, `Unhandled error: ${error.message}`);
    return toFailure(error.message || UNKNOWN_ERROR_MESSAGE);
  }

  logger.error({ err: error }, "Unhandled non-Error exception");
  return toFailure(UNKNOWN_ERROR_MESSAGE);
}

export default handleError;
