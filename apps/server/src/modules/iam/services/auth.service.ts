import { Injectable } from "@nestjs/common";
import bcrypt from "bcrypt";

import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { TokenService, ACCESS_EXPIRY } from "./token.service";
import { AuthMeResponseBuilder } from "../dto/auth-me-response.dto";
import { LoginResponseBuilder } from "../dto/login-response.dto";
import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { StaffRepository } from "../repositories/staff.repository";
import { StudentsRepository } from "../repositories/students.repository";

@Injectable()
export class AuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly assignmentsRepo: CheckinStaffAssignmentsRepository,
    private readonly studentsRepo: StudentsRepository,
    private readonly staffRepo: StaffRepository
  ) {}

  /**
   * Authenticates an identity by account type and credentials.
   *
   * Business rules:
   * - STUDENT: looks up by student_code (MSSV) directly in students table.
   * - STAFF (BTC/CHECKIN_STAFF): looks up by email directly in staff table.
   * - All failure modes return the same generic `INVALID_CREDENTIALS` to prevent
   *   identity enumeration.
   * - Successfully authenticated CHECKIN_STAFF have their workshop assignments
   *   loaded and embedded in the access token payload.
   * - Access token expiry is 15 minutes (default WEB TTL).
   *
   * @param params.accountType - "STUDENT" or "STAFF" — determines lookup strategy.
   * @param params.password - The plaintext password to verify against bcrypt hash.
   * @param params.studentId - Required if accountType is "STUDENT" (MSSV format).
   * @param params.email - Required if accountType is "STAFF".
   * @returns OkResult with LoginResponseDto, or FailResult with INVALID_CREDENTIALS.
   */
  async login(params: {
    accountType: "STUDENT" | "STAFF";
    password: string;
    studentId?: string;
    email?: string;
  }): Promise<Result<ReturnType<typeof LoginResponseBuilder.from>>> {
    const { accountType, password, studentId, email } = params;

    if (accountType === "STUDENT") {
      if (!studentId) return Result.fail(authErrors.invalidCredentials());

      const studentResult = await this.studentsRepo.findById(studentId);
      if (studentResult.isFailure || !studentResult.data) {
        return Result.fail(authErrors.invalidCredentials());
      }

      const student = studentResult.data;
      if (!student.passwordHash) {
        return Result.fail(authErrors.invalidCredentials());
      }

      const passwordValid = await bcrypt.compare(
        password,
        student.passwordHash
      );
      if (!passwordValid) {
        return Result.fail(authErrors.invalidCredentials());
      }

      const accessToken = await this.tokenService.signAccessToken(
        {
          identityId: student.studentId,
          role: "STUDENT",
          studentId: student.studentId,
        },
        "WEB"
      );

      const refreshToken = await this.tokenService.signRefreshToken(
        student.studentId,
        "STUDENT"
      );

      return Result.ok(
        LoginResponseBuilder.from(
          { accessToken, refreshToken, expiresIn: ACCESS_EXPIRY.WEB },
          {
            identityId: student.studentId,
            email: student.email ?? "",
            role: "STUDENT",
          },
          { studentId: student.studentId, fullName: student.fullName }
        )
      );
    }

    // STAFF login
    if (!email) return Result.fail(authErrors.invalidCredentials());

    const staffResult = await this.staffRepo.findByEmail(email);
    if (staffResult.isFailure || !staffResult.data) {
      return Result.fail(authErrors.invalidCredentials());
    }

    const staff = staffResult.data;
    if (!staff.isActive) {
      return Result.fail(authErrors.invalidCredentials());
    }

    const passwordValid = await bcrypt.compare(password, staff.passwordHash);
    if (!passwordValid) {
      return Result.fail(authErrors.invalidCredentials());
    }

    let allowedWorkshopIds: string[] | undefined;
    if (staff.role === "CHECKIN_STAFF") {
      const assignmentResult = await this.assignmentsRepo.findByStaffId(
        staff.staffId
      );
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    const accessToken = await this.tokenService.signAccessToken(
      {
        identityId: staff.staffId,
        role: staff.role,
        allowedWorkshopIds,
        staffId: staff.staffId,
      },
      "WEB"
    );

    const refreshToken = await this.tokenService.signRefreshToken(
      staff.staffId,
      "STAFF"
    );

    return Result.ok(
      LoginResponseBuilder.from(
        { accessToken, refreshToken, expiresIn: ACCESS_EXPIRY.WEB },
        {
          identityId: staff.staffId,
          email: staff.email,
          role: staff.role,
          allowedWorkshopIds,
        },
        { studentId: undefined, fullName: staff.fullName }
      )
    );
  }

  /**
   * Issues a new access token (and refresh token) from an existing refresh token.
   *
   * Business rules:
   * - The consumed refresh token is blacklisted in Redis (refresh token rotation).
   * - If the refresh token is expired, already blacklisted, or the identity status is
   *   not valid, the request is rejected with REFRESH_TOKEN_INVALID.
   *
   * Side effects: Blacklists the old refresh token's jti in Redis. Issues a new refresh token.
   *
   * @param refreshTokenStr - The raw JWT refresh token string.
   * @returns OkResult with new accessToken, refreshToken, and expiresIn, or FailResult with REFRESH_TOKEN_INVALID.
   */
  async refreshToken(
    refreshTokenStr: string,
    platform: "WEB" | "MOBILE"
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

    const { sub, type, jti: oldJti } = verifyResult.data;

    const isBlacklisted = await this.tokenService.isBlacklisted(oldJti);
    if (isBlacklisted) {
      return Result.fail(authErrors.refreshTokenInvalid());
    }

    if (type === "STUDENT") {
      const studentResult = await this.studentsRepo.findById(sub);
      if (studentResult.isFailure || !studentResult.data) {
        return Result.fail(authErrors.refreshTokenInvalid());
      }

      await this.tokenService.blacklistToken(oldJti, 604_800);

      const newAccessToken = await this.tokenService.signAccessToken(
        {
          identityId: sub,
          role: "STUDENT",
          studentId: sub,
        },
        platform
      );

      const newRefreshToken = await this.tokenService.signRefreshToken(
        sub,
        "STUDENT"
      );

      return Result.ok({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_EXPIRY[platform],
      });
    }

    // STAFF refresh
    const staffResult = await this.staffRepo.findById(sub);
    if (staffResult.isFailure || !staffResult.data) {
      return Result.fail(authErrors.refreshTokenInvalid());
    }

    const staff = staffResult.data;
    if (!staff.isActive) {
      return Result.fail(authErrors.refreshTokenInvalid());
    }

    await this.tokenService.blacklistToken(oldJti, 604_800);

    let allowedWorkshopIds: string[] | undefined;
    if (staff.role === "CHECKIN_STAFF") {
      const assignmentResult = await this.assignmentsRepo.findByStaffId(sub);
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    const newAccessToken = await this.tokenService.signAccessToken(
      {
        identityId: sub,
        role: staff.role,
        allowedWorkshopIds,
        staffId: sub,
      },
      platform
    );

    const newRefreshToken = await this.tokenService.signRefreshToken(
      sub,
      "STAFF"
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
   * @param _identityId - The identity ID (studentId or staffId, used for audit).
   * @param jti - The unique token identifier to blacklist.
   */
  async logout(
    _identityId: string,
    jti: string,
    refreshTokenStr?: string
  ): Promise<Result<void>> {
    await this.tokenService.blacklistToken(jti, 900);

    if (refreshTokenStr) {
      const refreshJti =
        this.tokenService.extractRefreshTokenJti(refreshTokenStr);
      if (refreshJti) {
        await this.tokenService.blacklistToken(refreshJti, 604_800);
      }
    }

    return Result.ok();
  }

  /**
   * Retrieves the authenticated identity's profile with role-specific fields.
   *
   * Business rules:
   * - STUDENT: profile from students table (studentId, fullName).
   * - CHECKIN_STAFF: includes assigned workshop IDs.
   * - BTC: base fields only.
   *
   * @param identityId - The identity ID (studentId for STUDENT, staffId for STAFF).
   * @param role - RBAC role to determine which profile to fetch.
   * @returns OkResult with AuthMeResponseDto containing role-appropriate fields.
   */
  async getMe(
    identityId: string,
    role: string
  ): Promise<Result<ReturnType<typeof AuthMeResponseBuilder.from>>> {
    if (role === "STUDENT") {
      const studentResult = await this.studentsRepo.findById(identityId);
      if (studentResult.isFailure || !studentResult.data) {
        return Result.fail(authErrors.userNotFound(identityId));
      }

      const student = studentResult.data;
      return Result.ok(
        AuthMeResponseBuilder.from(
          {
            identityId: student.studentId,
            email: student.email ?? "",
            role: "STUDENT",
          },
          { studentId: student.studentId, fullName: student.fullName }
        )
      );
    }

    const staffResult = await this.staffRepo.findById(identityId);
    if (staffResult.isFailure || !staffResult.data) {
      return Result.fail(authErrors.userNotFound(identityId));
    }

    const staff = staffResult.data;
    let allowedWorkshopIds: string[] | undefined;

    if (staff.role === "CHECKIN_STAFF") {
      const assignmentResult =
        await this.assignmentsRepo.findByStaffId(identityId);
      if (assignmentResult.isSuccess && assignmentResult.data) {
        allowedWorkshopIds = assignmentResult.data.workshopIds;
      }
    }

    return Result.ok(
      AuthMeResponseBuilder.from(
        {
          identityId: staff.staffId,
          email: staff.email,
          role: staff.role,
          allowedWorkshopIds,
        },
        { studentId: undefined, fullName: staff.fullName }
      )
    );
  }
}
