/**
 * Public user representation returned by admin user endpoints.
 *
 * Excludes sensitive fields such as `password_hash`.
 */
export interface UserResponseDto {
  user_id: string;
  email: string;
  role: string;
  status: string;
  created_at: Date;
}

/**
 * Builds a UserResponseDto from a raw user entity, excluding sensitive fields.
 */
export class UserResponseBuilder {
  static from(user: {
    userId: string;
    email: string;
    role: string;
    status: string;
    createdAt: Date;
  }): UserResponseDto {
    return {
      user_id: user.userId,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.createdAt,
    };
  }
}
