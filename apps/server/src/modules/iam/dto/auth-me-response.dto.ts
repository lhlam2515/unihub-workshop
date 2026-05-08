/**
 * Current user profile returned by GET /auth/me.
 *
 * Fields vary by role:
 * - STUDENT: includes studentId, fullName.
 * - CHECKIN_STAFF: includes allowedWorkshopIds.
 * - BTC: base fields only.
 */
export interface AuthMeResponseDto {
  userId: string;
  email: string;
  role: string;
  studentId?: string;
  fullName?: string;
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
      userId: user.userId,
      email: user.email,
      role: user.role,
    };

    if (user.role === "STUDENT" && studentProfile) {
      return {
        ...base,
        studentId: studentProfile.studentId,
        fullName: studentProfile.fullName,
      };
    }

    if (user.role === "CHECKIN_STAFF") {
      return {
        ...base,
        allowedWorkshopIds: user.allowedWorkshopIds ?? [],
      };
    }

    return base;
  }
}
