import { randomUUID } from "crypto";

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import z, { type ZodError } from "zod";

import { winstonLogger } from "@/core/config/logger.config";
import { errorResponse } from "@/shared/response/builder";
import {
  categoryToStatus,
  systemErrors,
  validationError,
} from "@/shared/response/errors";
import type {
  AppError,
  ErrorCategory,
  FieldError,
} from "@/shared/response/types";

/** Maps HTTP status codes to error categories for non-domain HttpExceptions. */
const STATUS_TO_CATEGORY: Partial<Record<number, ErrorCategory>> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION",
  [HttpStatus.UNAUTHORIZED]: "AUTH",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.GONE]: "GONE",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "BUSINESS",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMIT",
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers["x-request-id"] as string) || randomUUID();

    let appError: AppError;
    let statusCode: number;

    if (exception instanceof ZodValidationException) {
      statusCode = HttpStatus.BAD_REQUEST;

      const zodError = exception.getZodError() as ZodError;
      const issues: z.core.$ZodIssue[] = zodError.issues;

      const fieldErrors: FieldError[] = issues.map((err) => ({
        field: err.path.join("."),
        rule: err.code,
        message: err.message,
      }));

      appError = validationError(fieldErrors);
    } else if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null &&
        "category" in exceptionResponse
      ) {
        appError = exceptionResponse as AppError;
        statusCode = categoryToStatus(appError.category);
      } else {
        statusCode = exception.getStatus();
        const category = STATUS_TO_CATEGORY[statusCode] ?? "INTERNAL";
        const responseBody = exception.getResponse();
        const message =
          typeof responseBody === "string" ? responseBody : exception.message;
        appError = {
          category,
          code: "INTERNAL_ERROR",
          message,
        };
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      appError = systemErrors.internal(exception);
    }

    if (statusCode >= 500) {
      winstonLogger.error(
        `[${requestId}] ${request.method} ${request.url} - ${appError.message}`,
        exception instanceof Error ? exception.stack : String(exception),
        GlobalExceptionFilter.name
      );
    }

    response.status(statusCode).json(errorResponse(appError, { requestId }));
  }
}
