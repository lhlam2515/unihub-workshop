/**
 * Current user profile returned by GET /auth/me.
 *
 * Fields vary by role:
 * - STUDENT: includes student_code, full_name, faculty.
 * - CHECKIN_STAFF: includes allowed_workshop_ids.
 * - ORGANIZER: base fields only.
 */
export interface AuthMeResponseDto {
  user_id: string;
  email: string;
  role: string;
  student_code?: string;
  full_name?: string;
  faculty?: string;
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
      studentCode: string;
      fullName: string;
      faculty: string | null;
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
        student_code: studentProfile.studentCode,
        full_name: studentProfile.fullName,
        faculty: studentProfile.faculty ?? undefined,
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
