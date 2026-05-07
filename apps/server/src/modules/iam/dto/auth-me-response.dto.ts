/**
 * Current user profile returned by GET /auth/me.
 *
 * Fields vary by role:
 * - STUDENT: includes student_id, full_name.
 * - CHECKIN_STAFF: includes allowed_workshop_ids.
 * - BTC: base fields only.
 */
export interface AuthMeResponseDto {
  user_id: string;
  email: string;
  role: string;
  student_id?: string;
  full_name?: string;
  allowed_workshop_ids?: string[];
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
      user_id: user.userId,
      email: user.email,
      role: user.role,
    };

    if (user.role === "STUDENT" && studentProfile) {
      return {
        ...base,
        student_id: studentProfile.studentId,
        full_name: studentProfile.fullName,
      };
    }

    if (user.role === "CHECKIN_STAFF") {
      return {
        ...base,
        allowed_workshop_ids: user.allowedWorkshopIds ?? [],
      };
    }

    return base;
  }
}
