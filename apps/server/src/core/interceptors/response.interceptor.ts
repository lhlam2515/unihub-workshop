import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

import { resultToHttpResponse } from '@/shared/response/builder';
import { Result } from '@/shared/response/result';

import type { Request, Response } from 'express';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
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

        const requestIdHeader = request.headers['x-request-id'];
        const requestId = Array.isArray(requestIdHeader)
          ? requestIdHeader[0]
          : requestIdHeader;
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
