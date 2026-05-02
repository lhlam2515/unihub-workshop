/**
 * Workshop Scope Guard
 *
 * Enforces row-level (scope-level) authorization for check-in staff.
 * Validates that the target `workshop_id` in the request falls within the
 * staff member's assigned workshop list (`allowed_workshop_ids` from JWT).
 *
 * Lifecycle position: Stage 1 — Inbound Security (after JwtAuthGuard, alongside RolesGuard).
 * Depends on: JwtAuthGuard (requires `request.user.allowed_workshop_ids`).
 *
 * Scope validation flow:
 * 1. Extract `workshop_id` from `request.params.id` or `request.body.workshop_id`.
 * 2. Read `allowed_workshop_ids` from `request.user` (set by JwtAuthGuard).
 * 3. Verify the workshop ID is in the allowed list — deny with 403 if not.
 *
 * Error mapping (caught by GlobalExceptionFilter):
 * - No workshop_id in params or body → 403 "Workshop identifier is required"
 * - Workshop not in allowed list → 403 with workshop-specific message
 *
 * @see used in Check-in Module controllers
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class WorkshopScopeGuard implements CanActivate {
  /**
   * Validates that the requested workshop is within the staff member's assigned scope.
   *
   * Business rules:
   * - The `workshop_id` is extracted from route params first, then request body.
   * - The JWT's `allowed_workshop_ids` array defines the staff member's authorized workshops.
   * - A staff member MUST NOT check in attendees for workshops outside their assignment.
   *
   * @param context - NestJS execution context providing access to the HTTP request.
   * @returns `true` if the workshop is in the staff member's allowed list.
   * @throws ForbiddenException if no workshop_id is found or it is not in the allowed list.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    const allowedWorkshops: string[] = user?.allowed_workshop_ids ?? [];
    const workshopId: string | undefined =
      (request.params.id as string) ||
      ((request.body as Record<string, unknown> | null)?.workshop_id as
        | string
        | undefined);

    if (!workshopId) {
      throw new ForbiddenException("Workshop identifier is required");
    }

    if (!allowedWorkshops.includes(workshopId)) {
      throw new ForbiddenException(
        `Staff is not authorized to check in for workshop ${workshopId}.`
      );
    }

    return true;
  }
}
