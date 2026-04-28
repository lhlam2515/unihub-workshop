/**
 * Idempotency Key Decorator
 *
 * createParamDecorator trích xuất X-Idempotency-Key header.
 * Dùng trong PaymentsController để nhận idempotency key từ client.
 * Throw 400 VALIDATION_FAILED nếu header vắng mặt tại route yêu cầu.
 *
 * @example
 * @Post()
 * create(@IdempotencyKey() key: string) {
 *   // key is the X-Idempotency-Key header value
 * }
 */

import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const key = request.headers['x-idempotency-key'] as string;

    if (!key) {
      throw new BadRequestException('Missing X-Idempotency-Key header');
    }

    return key;
  }
);
