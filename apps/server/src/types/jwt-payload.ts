/**
 * Union of RBAC roles enforced by the system.
 *
 * Mirrors the `user_role` PostgreSQL enum defined in `src/database/schema/enums.schema.ts`.
 * Defined here (rather than imported from database/) to respect the ESLint boundary
 * rule: `shared` may only import from `shared`.
 */
export type UserRole = "STUDENT" | "BTC" | "CHECKIN_STAFF";

/**
 * JWT Payload contract shared across guards, decorators, and TokenService.
 *
 * Attached to `request.user` by JwtAuthGuard after successful verification.
 * The @CurrentUser() decorator extracts this payload for controller methods.
 *
 * @see JwtAuthGuard for verification and attachment
 * @see CurrentUser decorator for extraction
 */
export interface JwtPayload {
  /** User ID (mapped from `sub` claim in JWT). */
  sub: string;
  /** RBAC role assigned to the user. */
  role: UserRole;
  /** Unique token identifier used for blacklist/revocation checks. */
  jti: string;
  /** Workshop IDs this check-in staff member is authorized to access. Empty array for non-staff roles. */
  allowed_workshop_ids: string[];
}
