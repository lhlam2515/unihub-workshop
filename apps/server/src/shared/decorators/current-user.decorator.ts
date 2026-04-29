/**
 * Current User Decorator
 *
 * createParamDecorator trích xuất request.user (JwtPayload được gắn bởi JwtAuthGuard).
 * Dùng trong controller để lấy user_id, role, allowed_workshop_ids mà không cần
 * inject request object trực tiếp.
 *
 * @example
 * @Post()
 * create(@CurrentUser() user: JwtPayload) {
 *   // user.id, user.role, etc.
 * }
 */

import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user; // JwtPayload attached by JwtAuthGuard
  }
);
