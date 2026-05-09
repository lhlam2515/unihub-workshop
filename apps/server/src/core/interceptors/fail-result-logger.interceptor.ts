import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { map, Observable } from "rxjs";

import { Result } from "@/shared/response/result";
import type { ErrorCategory } from "@/shared/response/types";

import type { LoggerService } from "@nestjs/common";
import type { Request } from "express";

const ERROR_LEVELS: Record<ErrorCategory, "error" | "warn" | "verbose"> = {
  INTERNAL: "error",
  EXTERNAL: "error",
  OVERLOADED: "error",
  BUSINESS: "warn",
  CONFLICT: "warn",
  NOT_FOUND: "warn",
  GONE: "warn",
  FORBIDDEN: "warn",
  RATE_LIMIT: "warn",
  VALIDATION: "verbose",
  AUTH: "verbose",
};

@Injectable()
export class FailResultLoggerInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const logContext = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      map((value: unknown) => {
        if (!(value instanceof Result) || value.isSuccess) {
          return value;
        }

        const error = value.error;
        const level = ERROR_LEVELS[error.category] ?? "warn";
        const meta = JSON.stringify({
          code: error.code,
          category: error.category,
          context: error.context,
          cause: error.cause,
        });

        const msg = `[${error.code}] ${method} ${url} - ${error.message}`;

        if (level === "error") {
          this.logger.error(msg, meta, logContext);
        } else if (level === "verbose") {
          this.logger.verbose?.(msg, logContext);
        } else {
          this.logger.warn(msg, logContext);
        }

        return value;
      })
    );
  }
}
