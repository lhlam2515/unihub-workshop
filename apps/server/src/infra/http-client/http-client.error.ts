import { createError } from "@/shared/response/errors";
import type { AppError } from "@/shared/response/types";

export type HttpErrorKind =
  | "TIMEOUT"
  | "SERVER_ERROR"
  | "CLIENT_ERROR"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "CIRCUIT_OPEN";

export class HttpClientError extends Error {
  constructor(
    public readonly kind: HttpErrorKind,
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

export function httpClientErrorToAppError(error: HttpClientError): AppError {
  switch (error.kind) {
    case "TIMEOUT":
      return createError({
        category: "EXTERNAL",
        code: "INTERNAL_ERROR",
        message: `Upstream request timed out: ${error.message}`,
        context: { httpKind: error.kind },
        cause: error.cause,
      });
    case "SERVER_ERROR":
      return createError({
        category: "EXTERNAL",
        code: "INTERNAL_ERROR",
        message: `Upstream server error (${error.statusCode}): ${error.message}`,
        context: { httpKind: error.kind, statusCode: error.statusCode },
        cause: error.cause,
      });
    case "CLIENT_ERROR":
      return createError({
        category: "EXTERNAL",
        code: "INTERNAL_ERROR",
        message: `Upstream client error (${error.statusCode}): ${error.message}`,
        context: { httpKind: error.kind, statusCode: error.statusCode },
        cause: error.cause,
      });
    case "RATE_LIMITED":
      return createError({
        category: "RATE_LIMIT",
        code: "RATE_LIMIT_EXCEEDED",
        message: `Upstream rate limited (${error.statusCode}): ${error.message}`,
        context: { httpKind: error.kind, statusCode: error.statusCode },
        cause: error.cause,
      });
    case "NETWORK_ERROR":
      return createError({
        category: "EXTERNAL",
        code: "INTERNAL_ERROR",
        message: `Network error reaching upstream: ${error.message}`,
        context: { httpKind: error.kind },
        cause: error.cause,
      });
    case "PARSE_ERROR":
      return createError({
        category: "INTERNAL",
        code: "INTERNAL_ERROR",
        message: `Failed to parse upstream response: ${error.message}`,
        context: { httpKind: error.kind },
        cause: error.cause,
      });
    case "CIRCUIT_OPEN":
      return createError({
        category: "OVERLOADED",
        code: "INTERNAL_ERROR",
        message: `Circuit breaker open: ${error.message}`,
        context: { httpKind: error.kind },
        cause: error.cause,
      });
  }
}
