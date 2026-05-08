/**
 * Idempotency Key Decorator
 *
 * Extracts the `Idempotency-Key` header from the request (IETF standard).
 * Used in PaymentsController and RegistrationsController to feed the
 * IdempotencyMechanic for duplicate-prevention.
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
    const raw = request.headers["idempotency-key"];
    const key = Array.isArray(raw) ? raw[0] : raw;

    if (!key) {
      throw new BadRequestException("Missing Idempotency-Key header");
    }

    return key;
  }
);
