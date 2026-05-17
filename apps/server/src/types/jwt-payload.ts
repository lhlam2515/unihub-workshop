/**
 * Union of RBAC roles enforced by the system.
 *
 * Mirrors the `staff_role` (for staff) enum. STUDENT role is implied for
 * student authentication. Defined here rather than imported from database/
 * to respect the ESLint boundary rule: `shared` may only import from `shared`.
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
  /**
   * Student code (MSSV) — present only for STUDENT role.
   * This is the TEXT primary key of the `students` table.
   * Used for IDOR-enforced student lookups in registrations, payments, and device tokens.
   *
   * Example: "21127001"
   */
  studentId?: string;
  /**
   * Staff UUID from the `staff` table — present for BTC and CHECKIN_STAFF roles.
   * Required when setting `created_by` on workshops (FK references `staff.staff_id`).
   */
  staffId?: string;
}
