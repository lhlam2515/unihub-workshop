/**
 * Roles Decorator
 *
 * Attaches required role metadata to a route handler or controller.
 * RolesGuard reads this metadata to enforce RBAC authorization.
 *
 * @param roles - One or more UserRole values required to access the route.
 */
import { SetMetadata } from "@nestjs/common";

export const Roles = (...roles: string[]) => SetMetadata("roles", roles);
