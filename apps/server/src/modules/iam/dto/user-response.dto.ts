/**
 * Public user representation returned by admin user endpoints.
 *
 * Excludes sensitive fields such as `password_hash`.
 */
export interface UserResponseDto {
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
}

/**
 * Builds a UserResponseDto from a raw user entity, excluding sensitive fields.
 */
export class UserResponseBuilder {
  static from(user: UserResponseDto): UserResponseDto {
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
