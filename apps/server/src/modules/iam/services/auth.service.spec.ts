import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";

import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { AuthService } from "./auth.service";
import { StudentProfileService } from "./student-profile.service";
import { TokenService } from "./token.service";
import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { StudentsRepository } from "../repositories/students.repository";
import { UsersRepository } from "../repositories/users.repository";

describe("AuthService", () => {
  let authService: AuthService;
  let mockUsersRepo: Record<string, jest.Mock>;
  let mockTokenService: Record<string, jest.Mock>;
  let mockStudentProfileService: Record<string, jest.Mock>;
  let mockAssignmentsRepo: Record<string, jest.Mock>;
  let mockStudentsRepo: Record<string, jest.Mock>;

  const STUDENT_ID = "20210001";
  const accessToken = "jwt-access-token";
  const refreshToken = "jwt-refresh-token";

  const mockStudent = {
    studentId: STUDENT_ID,
    userId: "usr-1",
    studentCode: STUDENT_ID,
    fullName: "John Doe",
    faculty: "Engineering",
    classYear: 2021,
    emailEdu: "john@edu.test",
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeUser = {
    userId: "usr-1",
    email: "john@test.com",
    passwordHash: "hashed-password",
    role: "STUDENT" as const,
    status: "ACTIVE" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const checkinStaffUser = {
    userId: "usr-staff",
    email: "staff@test.com",
    passwordHash: "hashed-password",
    role: "CHECKIN_STAFF" as const,
    status: "ACTIVE" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const organizerUser = {
    userId: "usr-org",
    email: "org@test.com",
    passwordHash: "hashed-password",
    role: "BTC" as const,
    status: "ACTIVE" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const hash = await bcrypt.hash("correct-password", 1);
    activeUser.passwordHash = hash;
    checkinStaffUser.passwordHash = hash;
    organizerUser.passwordHash = hash;
  });

  beforeEach(async () => {
    mockUsersRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };

    mockTokenService = {
      signAccessToken: jest.fn(),
      signRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      blacklistToken: jest.fn(),
      isBlacklisted: jest.fn().mockResolvedValue(false),
    };

    mockStudentProfileService = {
      getProfileByUserId: jest.fn(),
    };

    mockAssignmentsRepo = {
      findByUserId: jest.fn(),
    };

    mockStudentsRepo = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersRepository, useValue: mockUsersRepo },
        { provide: TokenService, useValue: mockTokenService },
        { provide: StudentProfileService, useValue: mockStudentProfileService },
        {
          provide: CheckinStaffAssignmentsRepository,
          useValue: mockAssignmentsRepo,
        },
        { provide: StudentsRepository, useValue: mockStudentsRepo },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------
  describe("login", () => {
    beforeEach(() => {
      mockTokenService.signAccessToken.mockResolvedValue(accessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(refreshToken);
    });

    describe("STUDENT login", () => {
      it("returns OkResult with LoginResponseDto for valid student credentials", async () => {
        mockStudentsRepo.findById.mockResolvedValue(Result.ok(mockStudent));
        mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));

        const result = await authService.login({
          accountType: "STUDENT",
          password: "correct-password",
          studentId: STUDENT_ID,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.accessToken).toBe(accessToken);
        expect(result.data.refreshToken).toBe(refreshToken);
        expect(result.data.expiresIn).toBe(900);
        expect(result.data.user.id).toBe(activeUser.userId);
        expect(result.data.user.email).toBe(activeUser.email);
        expect(result.data.user.role).toBe(activeUser.role);
        expect(result.data.user.fullName).toBe(mockStudent.fullName);
        expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
          {
            userId: activeUser.userId,
            role: activeUser.role,
            allowedWorkshopIds: undefined,
            studentId: STUDENT_ID,
          },
          "WEB"
        );
        expect(mockTokenService.signRefreshToken).toHaveBeenCalledWith(
          activeUser.userId
        );
      });

      it("returns INVALID_CREDENTIALS when student not found", async () => {
        mockStudentsRepo.findById.mockResolvedValue(Result.ok(null));

        const result = await authService.login({
          accountType: "STUDENT",
          password: "correct-password",
          studentId: "nonexistent",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns INVALID_CREDENTIALS when student has no linked user", async () => {
        mockStudentsRepo.findById.mockResolvedValue(
          Result.ok({ ...mockStudent, userId: null })
        );

        const result = await authService.login({
          accountType: "STUDENT",
          password: "correct-password",
          studentId: STUDENT_ID,
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns INVALID_CREDENTIALS when studentId is missing", async () => {
        const result = await authService.login({
          accountType: "STUDENT",
          password: "correct-password",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });
    });

    describe("STAFF login", () => {
      it("returns OkResult for valid staff credentials", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(organizerUser));

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "org@test.com",
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.accessToken).toBe(accessToken);
        expect(result.data.user.role).toBe("BTC");
      });

      it("returns INVALID_CREDENTIALS when email not found", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(null));

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "unknown@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns INVALID_CREDENTIALS when email is missing", async () => {
        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });
    });

    describe("common login checks", () => {
      it("returns INVALID_CREDENTIALS when user is not ACTIVE", async () => {
        const suspendedUser = { ...activeUser, status: "SUSPENDED" as const };
        mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(suspendedUser));

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "john@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns INVALID_CREDENTIALS when password is wrong", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(activeUser));

        const result = await authService.login({
          accountType: "STAFF",
          password: "wrong-password",
          email: "john@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns FailResult when user lookup fails", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(
          Result.fail({
            category: "INTERNAL",
            code: "INTERNAL_ERROR",
            message: "DB error",
          })
        );

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "john@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe("INVALID_CREDENTIALS");
      });

      it("loads allowedWorkshopIds for CHECKIN_STAFF on login", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(
          Result.ok(checkinStaffUser)
        );
        mockAssignmentsRepo.findByUserId.mockResolvedValue(
          Result.ok({
            assignmentId: "assign-1",
            userId: checkinStaffUser.userId,
            workshopIds: ["ws-1", "ws-2"],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "staff@test.com",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
          {
            userId: checkinStaffUser.userId,
            role: checkinStaffUser.role,
            allowedWorkshopIds: ["ws-1", "ws-2"],
          },
          "WEB"
        );
      });

      it("allows CHECKIN_STAFF login even when assignment lookup fails", async () => {
        mockUsersRepo.findByEmail.mockResolvedValue(
          Result.ok(checkinStaffUser)
        );
        mockAssignmentsRepo.findByUserId.mockResolvedValue(
          Result.fail({
            category: "INTERNAL",
            code: "INTERNAL_ERROR",
            message: "DB error",
          })
        );

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "staff@test.com",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
          {
            userId: checkinStaffUser.userId,
            role: checkinStaffUser.role,
            allowedWorkshopIds: undefined,
          },
          "WEB"
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // refreshToken
  // ---------------------------------------------------------------------------
  describe("refreshToken", () => {
    const newAccessToken = "new-jwt-access";
    const newRefreshToken = "new-jwt-refresh";
    const decodedPayload = { sub: "usr-1", jti: "old-jti" };

    beforeEach(() => {
      mockTokenService.signAccessToken.mockResolvedValue(newAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(newRefreshToken);
      // activeUser is STUDENT role — service calls studentsRepo.findByUserId to embed studentId
      mockStudentsRepo.findByUserId.mockResolvedValue(Result.ok(mockStudent));
    });

    it("returns new token pair when refresh token is valid", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(decodedPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));

      const result = await authService.refreshToken(
        "valid-refresh-token",
        "WEB"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.accessToken).toBe(newAccessToken);
      expect(result.data.refreshToken).toBe(newRefreshToken);
      expect(result.data.expiresIn).toBe(900);
      expect(mockTokenService.blacklistToken).toHaveBeenCalledWith(
        "old-jti",
        604_800
      );
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when refresh token is expired", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.fail(authErrors.refreshTokenInvalid())
      );

      const result = await authService.refreshToken("expired-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when user is not found", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(decodedPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when user is suspended", async () => {
      const suspendedUser = { ...activeUser, status: "SUSPENDED" as const };
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(decodedPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(suspendedUser));

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult when user lookup fails", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(decodedPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("loads allowedWorkshopIds for CHECKIN_STAFF on refresh", async () => {
      const staffPayload = { sub: "usr-staff", jti: "old-jti" };
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(staffPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(checkinStaffUser));
      mockAssignmentsRepo.findByUserId.mockResolvedValue(
        Result.ok({
          assignmentId: "assign-1",
          userId: checkinStaffUser.userId,
          workshopIds: ["ws-10"],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await authService.refreshToken("valid-staff-token", "WEB");

      expect(result.isSuccess).toBe(true);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        {
          userId: checkinStaffUser.userId,
          role: checkinStaffUser.role,
          allowedWorkshopIds: ["ws-10"],
        },
        "WEB"
      );
    });

    it("returns MOBILE expiry when platform is MOBILE", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(decodedPayload)
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));

      const result = await authService.refreshToken(
        "valid-refresh-token",
        "MOBILE"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.expiresIn).toBe(28800);
    });
  });

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------
  describe("logout", () => {
    it("blacklists the token's jti and returns OkResult", async () => {
      mockTokenService.blacklistToken.mockResolvedValue(undefined);

      const result = await authService.logout("usr-1", "some-jti");

      expect(result.isSuccess).toBe(true);
      expect(mockTokenService.blacklistToken).toHaveBeenCalledWith(
        "some-jti",
        900
      );
    });

    it("is idempotent — calling logout multiple times succeeds", async () => {
      mockTokenService.blacklistToken.mockResolvedValue(undefined);

      const result1 = await authService.logout("usr-1", "same-jti");
      const result2 = await authService.logout("usr-1", "same-jti");

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(mockTokenService.blacklistToken).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getMe
  // ---------------------------------------------------------------------------
  describe("getMe", () => {
    it("returns base profile for BTC", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(organizerUser));

      const result = await authService.getMe(organizerUser.userId);

      expect(result.isSuccess).toBe(true);
      expect(result.data.id).toBe(organizerUser.userId);
      expect(result.data.email).toBe(organizerUser.email);
      expect(result.data.role).toBe(organizerUser.role);
      expect(result.data.fullName).toBe("");
      expect(result.data.allowedWorkshopIds).toBeUndefined();
    });

    it("returns profile with student fields for STUDENT", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));
      mockStudentProfileService.getProfileByUserId.mockResolvedValue(
        Result.ok({
          studentId: "stu-1",
          userId: activeUser.userId,
          studentCode: "20210001",
          fullName: "John Doe",
          faculty: "Engineering",
          classYear: 2021,
          emailEdu: "john@edu.test",
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await authService.getMe(activeUser.userId);

      expect(result.isSuccess).toBe(true);
      expect(result.data.id).toBe(activeUser.userId);
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.fullName).toBe("John Doe");
    });

    it("returns profile with allowedWorkshopIds for CHECKIN_STAFF", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(checkinStaffUser));
      mockAssignmentsRepo.findByUserId.mockResolvedValue(
        Result.ok({
          assignmentId: "assign-1",
          userId: checkinStaffUser.userId,
          workshopIds: ["ws-1", "ws-2"],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await authService.getMe(checkinStaffUser.userId);

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("CHECKIN_STAFF");
      expect(result.data.allowedWorkshopIds).toEqual(["ws-1", "ws-2"]);
    });

    it("returns FailResult with USER_NOT_FOUND when user does not exist", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authService.getMe("usr-nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when user lookup fails", async () => {
      mockUsersRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await authService.getMe("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("handles missing student profile gracefully for STUDENT", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));
      mockStudentProfileService.getProfileByUserId.mockResolvedValue(
        Result.ok(null)
      );

      const result = await authService.getMe(activeUser.userId);

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.fullName).toBe("");
    });

    it("handles missing assignments gracefully for CHECKIN_STAFF", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(checkinStaffUser));
      mockAssignmentsRepo.findByUserId.mockResolvedValue(Result.ok(null));

      const result = await authService.getMe(checkinStaffUser.userId);

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("CHECKIN_STAFF");
      expect(result.data.allowedWorkshopIds).toEqual([]);
    });
  });
});
