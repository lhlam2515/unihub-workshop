/**
 * Public Decorator
 *
 * SetMetadata decorator đánh dấu một route là PUBLIC (không cần JWT).
 * JwtAuthGuard đọc metadata IS_PUBLIC_KEY để skip xác thực.
 *
 * Dùng cho:
 * - POST /auth/login
 * - POST /auth/refresh
 * - GET /workshops
 * - GET /workshops/{id}
 *
 * @example
 * @Public()
 * @Get('/public-endpoint')
 */

import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
