import { Injectable } from "@nestjs/common";
import bcrypt from "bcrypt";

import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { StudentProfileService } from "./student-profile.service";
import { TokenService, ACCESS_EXPIRY } from "./token.service";
import { AuthMeResponseBuilder } from "../dto/auth-me-response.dto";
import { LoginResponseBuilder } from "../dto/login-response.dto";
import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { UsersRepository } from "../repositories/users.repository";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly tokenService: TokenService,
    private readonly studentProfileService: StudentProfileService,
    private readonly assignmentsRepo: CheckinStaffAssignmentsRepository
  ) {}

  /**
   * Authenticates a user by email and password.
   *
   * Business rules:
   * - All failure modes (wrong email, wrong password, suspended account) return the
   *   same generic `INVALID_CREDENTIALS` to prevent user enumeration.
   * - Successfully authenticated CHECKIN_STAFF users have their workshop assignments
   *   loaded and embedded in the access token payload.
   * - WEB platform returns refresh token as optional (set via HttpOnly cookie by the controller).
   * - MOBILE platform includes the refresh token in the response body.
   *
   * Side effects: Queries the users table, optionally queries the checkin_staff_assignments table.
   *
   * @param email - The user's email address.
   * @param password - The plaintext password to verify against the stored bcrypt hash.
   * @param platform - Determines access token expiry (WEB: 15min, MOBILE: 8hr).
   * @returns OkResult with LoginResponseDto, or FailResult with INVALID_CREDENTIALS.
   */
  async login(
    email: string,
    password: string,
    platform: "WEB" | "MOBILE"
  ): Promise<Result<ReturnType<typeof LoginResponseBuilder.from>>> {
    const userResult = await this.usersRepo.findByEmail(email);
    if (userResult.isFailure) return Result.fail(userResult.error);

    const user = userResult.data;
    if (!user || user.status !== "ACTIVE") {
      return Result.fail(authErrors.invalidCredentials());
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return Result.fail(authErrors.invalidCredentials());
    }

    let allowedWorkshopIds: string[] | undefined;
    if (user.role === "CHECKIN_STAFF") {
      const assignmentResult = await this.assignmentsRepo.findByUserId(
        user.userId
      );
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    const accessToken = await this.tokenService.signAccessToken(
      {
        userId: user.userId,
        role: user.role,
        allowedWorkshopIds,
      },
      platform
    );

    const expiresIn = platform === "WEB" ? 900 : 28800;

    const refreshToken = await this.tokenService.signRefreshToken(user.userId);

    return Result.ok(
      LoginResponseBuilder.from(
        { accessToken, refreshToken, expiresIn },
        {
          userId: user.userId,
          email: user.email,
          role: user.role,
          allowedWorkshopIds,
        }
      )
    );
  }

  /**
   * Issues a new access token (and refresh token) from an existing refresh token.
   *
   * Business rules:
   * - The consumed refresh token is blacklisted in Redis (refresh token rotation).
   * - If the refresh token is expired, already blacklisted, or the user status is
   *   not ACTIVE, the request is rejected with REFRESH_TOKEN_INVALID.
   *
   * Side effects: Blacklists the old refresh token's jti in Redis. Issues a new refresh token.
   *
   * @param refreshTokenStr - The raw JWT refresh token string.
   * @returns OkResult with new accessToken, refreshToken, and expiresIn, or FailResult with REFRESH_TOKEN_INVALID.
   */
  async refreshToken(
    refreshTokenStr: string,
    platform: "WEB" | "MOBILE" = "WEB"
  ): Promise<
    Result<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
    }>
  > {
    const verifyResult =
      await this.tokenService.verifyRefreshToken(refreshTokenStr);
    if (verifyResult.isFailure) return Result.fail(verifyResult.error);

    const { sub: userId, jti: oldJti } = verifyResult.data;

    const userResult = await this.usersRepo.findById(userId);
    if (userResult.isFailure) return Result.fail(userResult.error);
    if (!userResult.data || userResult.data.status !== "ACTIVE") {
      return Result.fail(authErrors.refreshTokenInvalid());
    }

    const user = userResult.data;

    // Blacklist old refresh token (rotation)
    await this.tokenService.blacklistToken(oldJti, 604_800);

    let allowedWorkshopIds: string[] | undefined;
    if (user.role === "CHECKIN_STAFF") {
      const assignmentResult = await this.assignmentsRepo.findByUserId(
        user.userId
      );
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    const newAccessToken = await this.tokenService.signAccessToken(
      {
        userId: user.userId,
        role: user.role,
        allowedWorkshopIds,
      },
      platform
    );

    const newRefreshToken = await this.tokenService.signRefreshToken(
      user.userId
    );

    return Result.ok({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_EXPIRY[platform],
    });
  }

  /**
   * Blacklists the current access token and terminates the session.
   *
   * Business rules:
   * - Idempotent: calling logout multiple times with the same or an already-blacklisted
   *   token succeeds silently.
   *
   * Side effects: Writes to Redis key `token:blacklist:{jti}` with a 900-second TTL.
   *
   * @param userId - The user's system ID (used for audit tracking).
   * @param jti - The unique token identifier to blacklist.
   * @returns OkResult<void> on success.
   */
  async logout(userId: string, jti: string): Promise<Result<void>> {
    await this.tokenService.blacklistToken(jti, 900);
    return Result.ok();
  }

  /**
   * Retrieves the authenticated user's profile with role-specific fields.
   *
   * Business rules:
   * - STUDENT users receive additional student profile fields (student_code, full_name, faculty).
   * - CHECKIN_STAFF users receive their assigned workshop IDs.
   * - ORGANIZER users receive only base fields.
   *
   * Side effects: Queries the users table. For STUDENT, also queries the students table.
   * For CHECKIN_STAFF, also queries the checkin_staff_assignments table.
   *
   * @param userId - The authenticated user's system ID.
   * @returns OkResult with AuthMeResponseDto containing role-appropriate fields,
   *          or FailResult with USER_NOT_FOUND.
   */
  async getMe(
    userId: string
  ): Promise<Result<ReturnType<typeof AuthMeResponseBuilder.from>>> {
    const userResult = await this.usersRepo.findById(userId);
    if (userResult.isFailure) return Result.fail(userResult.error);
    if (!userResult.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: "User not found.",
      });
    }

    const user = userResult.data;
    let studentProfile:
      | { studentCode: string; fullName: string; faculty: string | null }
      | undefined;
    let allowedWorkshopIds: string[] | undefined;

    if (user.role === "STUDENT") {
      const profileResult =
        await this.studentProfileService.getProfileByUserId(userId);
      if (profileResult.isSuccess && profileResult.data) {
        studentProfile = {
          studentCode: profileResult.data.studentCode,
          fullName: profileResult.data.fullName,
          faculty: profileResult.data.faculty,
        };
      }
    }

    if (user.role === "CHECKIN_STAFF") {
      const assignmentResult = await this.assignmentsRepo.findByUserId(userId);
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    return Result.ok(
      AuthMeResponseBuilder.from(
        {
          userId: user.userId,
          email: user.email,
          role: user.role,
          allowedWorkshopIds,
        },
        studentProfile
      )
    );
  }
}
