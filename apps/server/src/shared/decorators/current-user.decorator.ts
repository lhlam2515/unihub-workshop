/**
 * Current User Decorator
 *
 * Extracts the JwtPayload from `request.user` (attached by JwtAuthGuard).
 * Controllers use this to access the authenticated user's ID, role, and
 * scope without injecting the raw request object.
 *
 * This is the primary defense against IDOR — the user ID comes from the
 * verified JWT token, never from URL params or request body.
 */
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

import type { JwtPayload } from "@/types/jwt-payload";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as JwtPayload;
  }
);
