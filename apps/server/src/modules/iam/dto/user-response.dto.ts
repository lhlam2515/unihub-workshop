import type { User } from "@/infra/database/types/identity.types";

/**
 * Public user representation matching the OpenAPI UserResponse schema.
 *
 * Used by admin user management endpoints (/admin/users).
 * Excludes sensitive fields: passwordHash, updatedAt.
 */
export interface UserResponseDto {
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export class UserResponseBuilder {
  /**
   * Maps a User database entity to a UserResponseDto.
   *
   * @param user - Raw user entity from the database.
   * @returns UserResponseDto safe for API responses.
   */
  static from(user: User): UserResponseDto {
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
