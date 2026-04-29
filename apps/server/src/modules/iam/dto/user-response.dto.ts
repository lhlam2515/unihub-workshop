/**
 * User Response DTO
 *
 * Response: Used in list/detail endpoints
 * Shape: { user_id, email, role, status, created_at }
 *
 * Factory: from(user)
 * Loại bỏ password_hash và sensitive fields
 */

export interface UserResponseDto {
  user_id: string;
  email: string;
  role: string;
  status: string;
  created_at: Date;
}

export class UserResponseBuilder {
  static from(user: any): UserResponseDto {
    // TODO: Implement factory method
    // Map user entity to response DTO, exclude password_hash
    return {
      user_id: "",
      email: "",
      role: "",
      status: "",
      created_at: new Date(),
    };
  }
}
