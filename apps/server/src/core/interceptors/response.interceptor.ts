import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";

import {
  paginatedResultToHttpResponse,
  resultToHttpResponse,
} from "@/shared/response/builder";
import { Result } from "@/shared/response/result";

import type { Request, Response } from "express";

/**
 * Determines whether a Result payload has a paginated shape.
 */
function isPaginatedShape(
  data: unknown
): data is { items: unknown[]; total: number; page: number; limit: number } {
  if (data === null || data === undefined || typeof data !== "object") {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.items) &&
    Number.isFinite(obj.total) &&
    Number.isFinite(obj.page) &&
    Number.isFinite(obj.limit)
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const startedAt = Date.now();
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();

    return next.handle().pipe(
      map((value: unknown) => {
        if (!(value instanceof Result)) {
          return value;
        }

        const requestIdHeader = request.headers["x-request-id"];
        const requestId = Array.isArray(requestIdHeader)
          ? requestIdHeader[0]
          : requestIdHeader;

        // Handle paginated results (data has items + total + page + limit)
        if (value.isSuccess && isPaginatedShape(value.data)) {
          const { items, total, page, limit } = value.data;
          const [statusCode, body] = paginatedResultToHttpResponse(
            Result.ok({ items, total }),
            { page, limit },
            requestId
          );
          response.status(statusCode);
          return body;
        }

        const [statusCode, body] = resultToHttpResponse(value, {
          requestId,
          processingStartMs: startedAt,
        });

        response.status(statusCode);
        return body;
      })
    );
  }
}
