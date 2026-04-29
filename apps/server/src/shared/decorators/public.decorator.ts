/**
 * Public Decorator
 *
 * Marks a route as publicly accessible — JwtAuthGuard reads this metadata
 * to skip authentication for the decorated handler or controller.
 *
 * Used for:
 * - POST /auth/login
 * - POST /auth/refresh
 * - GET /workshops
 * - GET /workshops/:id
 */
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
