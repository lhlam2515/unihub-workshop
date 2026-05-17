/**
 * Current identity profile returned by GET /auth/me.
 *
 * Matches OpenAPI User schema.
 * Fields vary by role:
 * - STUDENT: id = studentId (MSSV)
 * - CHECKIN_STAFF: includes allowedWorkshopIds
 * - BTC: base fields only
 */
export interface AuthMeResponseDto {
  id: string;
  email: string;
  role: "STUDENT" | "BTC" | "CHECKIN_STAFF";
  fullName: string;
  allowedWorkshopIds?: string[];
}

/**
 * Builds an AuthMeResponseDto with role-specific field resolution.
 */
export class AuthMeResponseBuilder {
  static from(
    identity: {
      identityId: string;
      email: string;
      role: string;
      allowedWorkshopIds?: string[];
    },
    studentProfile?: {
      studentId: string | undefined;
      fullName: string;
    }
  ): AuthMeResponseDto {
    const base = {
      id: identity.identityId,
      email: identity.email,
      role: identity.role as "STUDENT" | "BTC" | "CHECKIN_STAFF",
      fullName: studentProfile?.fullName ?? "",
    };

    if (identity.role === "CHECKIN_STAFF") {
      return {
        ...base,
        allowedWorkshopIds: identity.allowedWorkshopIds ?? [],
      };
    }

    return base;
  }
}
