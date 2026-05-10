/**
 * Current user profile returned by GET /auth/me.
 *
 * Matches OpenAPI User schema.
 * Fields vary by role:
 * - STUDENT: id = studentId
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
    user: {
      userId: string;
      email: string;
      role: string;
      allowedWorkshopIds?: string[];
    },
    studentProfile?: {
      studentId: string;
      fullName: string;
    }
  ): AuthMeResponseDto {
    const base = {
      id: user.userId,
      email: user.email,
      role: user.role as "STUDENT" | "BTC" | "CHECKIN_STAFF",
      fullName: studentProfile?.fullName ?? "",
    };

    if (user.role === "CHECKIN_STAFF") {
      return {
        ...base,
        allowedWorkshopIds: user.allowedWorkshopIds ?? [],
      };
    }

    return base;
  }
}
