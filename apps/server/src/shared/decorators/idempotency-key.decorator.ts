/**
 * Idempotency Key Decorator
 *
 * Extracts the `X-Idempotency-Key` header from the request.
 * Used in PaymentsController to feed the IdempotencyMechanic for
 * Layer 1 duplicate-payment prevention.
 *
 * Throws 400 VALIDATION_FAILED if the header is missing on a route
 * that requires it.
 */
import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const raw = request.headers["x-idempotency-key"];
    const key = Array.isArray(raw) ? raw[0] : raw;

    if (!key) {
      throw new BadRequestException("Missing X-Idempotency-Key header");
    }

    return key;
  }
);
