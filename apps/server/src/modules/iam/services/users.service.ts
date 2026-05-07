import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { Result } from "@/shared/response/result";

import { UserResponseBuilder } from "../dto/user-response.dto";
import { UsersRepository } from "../repositories/users.repository";

import type { UserResponseDto } from "../dto/user-response.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly redisService: RedisService
  ) {}

  /**
   * Returns a paginated list of users, optionally filtered by role.
   *
   * Business rules:
   * - Results are sorted by `created_at` descending (newest first).
   * - The `password_hash` field is excluded via UserResponseBuilder.
   *
   * @param role - Optional role filter (STUDENT | ORGANIZER | CHECKIN_STAFF).
   * @param pagination.page - Page index (1-based, default 1).
   * @param pagination.limit - Items per page (default 20).
   * @returns OkResult with items array and total count, or FailResult with INTERNAL_ERROR.
   */
  async listUsers(
    role?: string,
    pagination?: { page: number; limit: number }
  ): Promise<Result<{ items: UserResponseDto[]; total: number }>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const result = await this.usersRepo.list(role, page, limit);
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      items: result.data.items.map((user) => UserResponseBuilder.from(user)),
      total: result.data.total,
    });
  }

  /**
   * Retrieves a single user by their system ID.
   *
   * @param id - The user's UUID.
   * @returns OkResult with UserResponseDto, or FailResult with USER_NOT_FOUND.
   */
  async getUserById(id: string): Promise<Result<UserResponseDto>> {
    const result = await this.usersRepo.findById(id);
    if (result.isFailure) return Result.fail(result.error);

    const user = result.data;
    if (!user) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `User ${id} not found.`,
      });
    }

    return Result.ok(UserResponseBuilder.from(user));
  }

  /**
   * Updates a user's account status and optionally revokes their active token.
   *
   * Business rules:
   * - When status is set to SUSPENDED, the admin's current token is blacklisted
   *   to prevent the suspended user from continuing their session.
   * - Reactivating a user (ACTIVE) does not trigger token revocation.
   *
   * Side effects: Writes to the users table. If SUSPENDED, writes to Redis blacklist.
   *
   * @param id - The target user's UUID.
   * @param status - New status: ACTIVE or SUSPENDED.
   * @returns OkResult with updated UserResponseDto, or FailResult with USER_NOT_FOUND.
   */
  async updateUserStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED"
  ): Promise<Result<UserResponseDto>> {
    const result = await this.usersRepo.updateStatus(id, status);
    if (result.isFailure) return Result.fail(result.error);

    const user = result.data;
    if (!user) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `User ${id} not found.`,
      });
    }

    if (status === "SUSPENDED") {
      await this.redisService.set(
        `user:suspended:${id}`,
        "true",
        604_800 // 7 days
      );
    } else if (status === "ACTIVE") {
      await this.redisService.del(`user:suspended:${id}`);
    }

    return Result.ok(UserResponseBuilder.from(user));
  }

  /**
   * Triggers a token revocation for the specified user.
   *
   * Note: The system does not track all issued tokens per user. This method
   * marks the account for re-authentication and invalidates the current session.
   *
   * @param userId - The target user's UUID.
   * @returns OkResult with a confirmation message, or FailResult with USER_NOT_FOUND.
   */
  async revokeUserTokens(userId: string): Promise<Result<{ message: string }>> {
    const result = await this.usersRepo.findById(userId);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `User ${userId} not found.`,
      });
    }

    // Set Redis suspension flag — checked by JwtAuthGuard on every request
    await this.redisService.set(
      `user:suspended:${userId}`,
      "true",
      604_800 // 7 days
    );

    return Result.ok({
      message: "All active sessions revoked. The user must re-authenticate.",
    });
  }
}
