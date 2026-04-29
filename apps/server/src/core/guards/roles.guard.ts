/**
 * Roles-Based Access Control (RBAC) Guard
 *
 * Enforces role-level authorization. Runs after JwtAuthGuard and reads the
 * `roles` metadata set by the `@Roles()` decorator to determine which roles
 * are permitted to access the route.
 *
 * Lifecycle position: Stage 1 — Inbound Security (after JwtAuthGuard).
 * Depends on: JwtAuthGuard (requires `request.user` to be populated).
 *
 * Authorization flow:
 * 1. Read the `roles` metadata from the route handler and controller class.
 * 2. If no roles are specified, allow the request (no authorization required).
 * 3. Extract `request.user.role` (set by JwtAuthGuard).
 * 4. Compare against the required roles — deny with 403 on mismatch.
 *
 * Error mapping (caught by GlobalExceptionFilter):
 * - Missing or empty `request.user.role` → 403 "Insufficient permissions"
 * - Role not in required list → 403 "Insufficient permissions"
 *
 * @see {@link Roles} decorator for specifying required roles
 * @see JwtAuthGuard for populating request.user
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Authorizes the request by comparing the user's role against the required roles.
   *
   * Business rules:
   * - If no `@Roles()` decorator is present on the handler or controller, the route
   *   is open to any authenticated user regardless of role.
   * - If `@Roles()` is present, the user's role MUST be in the declared list.
   * - Multiple roles on `@Roles()` are treated as a disjunction (any match grants access).
   *
   * @param context - NestJS execution context providing access to the HTTP request.
   * @returns `true` if the user's role is permitted.
   * @throws ForbiddenException if the user's role is not in the required list.
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>("roles", [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.role) {
      throw new ForbiddenException("Insufficient permissions");
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
