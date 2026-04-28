/**
 * Auth Me Response DTO
 *
 * Response: GET /auth/me
 * Shape: { user_id, email, role, student_code?, full_name?, faculty?, allowed_workshop_ids? }
 *
 * Factory: from(user, studentProfile?)
 * Maps role-specific fields based on user role
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

export class AuthMeResponseBuilder {
  static from(user: any, studentProfile?: any): AuthMeResponseDto {
    // TODO: Implement factory method
    // - Include student_code, full_name, faculty only for STUDENT role
    // - Include allowed_workshop_ids only for CHECKIN_STAFF role
    return {
      user_id: '',
      email: '',
      role: '',
    };
  }
}
