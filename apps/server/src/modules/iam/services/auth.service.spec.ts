import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";

import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { StaffRepository } from "../repositories/staff.repository";
import { StudentsRepository } from "../repositories/students.repository";

describe("AuthService", () => {
  let authService: AuthService;
  let mockStaffRepo: Record<string, jest.Mock>;
  let mockTokenService: Record<string, jest.Mock>;
  let mockAssignmentsRepo: Record<string, jest.Mock>;
  let mockStudentsRepo: Record<string, jest.Mock>;

  const STUDENT_ID = "20210001";
  const accessToken = "jwt-access-token";
  const refreshToken = "jwt-refresh-token";

  const mockStudent = {
    studentId: STUDENT_ID,
    fullName: "John Doe",
    faculty: "Engineering",
    classYear: 2021,
    emailEdu: "john@edu.test",
    email: "john@edu.test",
    passwordHash: "hashed-password",
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeStaff = {
    staffId: "usr-1",
    email: "john@test.com",
    fullName: "John Staff",
    passwordHash: "hashed-password",
    role: "BTC" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const checkinStaffRecord = {
    staffId: "usr-staff",
    email: "staff@test.com",
    fullName: "Checkin Staff",
    passwordHash: "hashed-password",
    role: "CHECKIN_STAFF" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const organizerRecord = {
    staffId: "usr-org",
    email: "org@test.com",
    fullName: "Organizer",
    passwordHash: "hashed-password",
    role: "BTC" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const hash = await bcrypt.hash("correct-password", 1);
    mockStudent.passwordHash = hash;
    activeStaff.passwordHash = hash;
    checkinStaffRecord.passwordHash = hash;
    organizerRecord.passwordHash = hash;
  });

  beforeEach(async () => {
    mockStaffRepo = {
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

    mockAssignmentsRepo = {
      findByStaffId: jest.fn(),
    };

    mockStudentsRepo = {
      findById: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TokenService, useValue: mockTokenService },
        {
          provide: CheckinStaffAssignmentsRepository,
          useValue: mockAssignmentsRepo,
        },
        { provide: StaffRepository, useValue: mockStaffRepo },
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

        const result = await authService.login({
          accountType: "STUDENT",
          password: "correct-password",
          studentId: STUDENT_ID,
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.accessToken).toBe(accessToken);
        expect(result.data.refreshToken).toBe(refreshToken);
        expect(result.data.expiresIn).toBe(900);
        expect(result.data.user.role).toBe("STUDENT");
        expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
          {
            identityId: STUDENT_ID,
            role: "STUDENT",
            studentId: STUDENT_ID,
          },
          "WEB"
        );
        expect(mockTokenService.signRefreshToken).toHaveBeenCalledWith(
          STUDENT_ID,
          "STUDENT"
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
        mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(organizerRecord));

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
        mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(null));

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
      it("returns INVALID_CREDENTIALS when staff is not active", async () => {
        const inactiveStaff = { ...activeStaff, isActive: false };
        mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(inactiveStaff));

        const result = await authService.login({
          accountType: "STAFF",
          password: "correct-password",
          email: "john@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns INVALID_CREDENTIALS when password is wrong", async () => {
        mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(activeStaff));

        const result = await authService.login({
          accountType: "STAFF",
          password: "wrong-password",
          email: "john@test.com",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error).toEqual(authErrors.invalidCredentials());
      });

      it("returns FailResult when user lookup fails", async () => {
        mockStaffRepo.findByEmail.mockResolvedValue(
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
        mockStaffRepo.findByEmail.mockResolvedValue(
          Result.ok(checkinStaffRecord)
        );
        mockAssignmentsRepo.findByStaffId.mockResolvedValue(
          Result.ok({
            assignmentId: "assign-1",
            staffId: checkinStaffRecord.staffId,
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
            identityId: checkinStaffRecord.staffId,
            role: checkinStaffRecord.role,
            allowedWorkshopIds: ["ws-1", "ws-2"],
            staffId: checkinStaffRecord.staffId,
          },
          "WEB"
        );
      });

      it("allows CHECKIN_STAFF login even when assignment lookup fails", async () => {
        mockStaffRepo.findByEmail.mockResolvedValue(
          Result.ok(checkinStaffRecord)
        );
        mockAssignmentsRepo.findByStaffId.mockResolvedValue(
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
            identityId: checkinStaffRecord.staffId,
            role: checkinStaffRecord.role,
            allowedWorkshopIds: undefined,
            staffId: checkinStaffRecord.staffId,
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

    beforeEach(() => {
      mockTokenService.signAccessToken.mockResolvedValue(newAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(newRefreshToken);
    });

    it("returns new token pair when STUDENT refresh token is valid", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: STUDENT_ID, jti: "old-jti", type: "STUDENT" })
      );
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(mockStudent));

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

    it("returns new token pair when STAFF refresh token is valid", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-1", jti: "old-jti", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(activeStaff));

      const result = await authService.refreshToken(
        "valid-refresh-token",
        "WEB"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.accessToken).toBe(newAccessToken);
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when refresh token is expired", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.fail(authErrors.refreshTokenInvalid())
      );

      const result = await authService.refreshToken("expired-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when student not found", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: STUDENT_ID, jti: "old-jti", type: "STUDENT" })
      );
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult with REFRESH_TOKEN_INVALID when staff is inactive", async () => {
      const inactiveStaff = { ...activeStaff, isActive: false };
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-1", jti: "old-jti", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(inactiveStaff));

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns FailResult when staff lookup fails", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-1", jti: "old-jti", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await authService.refreshToken("valid-token", "WEB");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("loads allowedWorkshopIds for CHECKIN_STAFF on refresh", async () => {
      const staffPayload = {
        sub: "usr-staff",
        jti: "old-jti",
        type: "STAFF" as const,
      };
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok(staffPayload)
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentsRepo.findByStaffId.mockResolvedValue(
        Result.ok({
          assignmentId: "assign-1",
          staffId: checkinStaffRecord.staffId,
          workshopIds: ["ws-10"],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await authService.refreshToken("valid-staff-token", "WEB");

      expect(result.isSuccess).toBe(true);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        {
          identityId: checkinStaffRecord.staffId,
          role: checkinStaffRecord.role,
          allowedWorkshopIds: ["ws-10"],
          staffId: checkinStaffRecord.staffId,
        },
        "WEB"
      );
    });

    it("returns MOBILE expiry when platform is MOBILE", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-1", jti: "old-jti", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(activeStaff));

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
      mockStaffRepo.findById.mockResolvedValue(Result.ok(organizerRecord));

      const result = await authService.getMe(organizerRecord.staffId, "BTC");

      expect(result.isSuccess).toBe(true);
      expect(result.data.id).toBe(organizerRecord.staffId);
      expect(result.data.email).toBe(organizerRecord.email);
      expect(result.data.role).toBe(organizerRecord.role);
      expect(result.data.fullName).toBe("Organizer");
      expect(result.data.allowedWorkshopIds).toBeUndefined();
    });

    it("returns profile with student fields for STUDENT", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(mockStudent));

      const result = await authService.getMe(STUDENT_ID, "STUDENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data.id).toBe(STUDENT_ID);
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.fullName).toBe("John Doe");
    });

    it("returns profile with allowedWorkshopIds for CHECKIN_STAFF", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentsRepo.findByStaffId.mockResolvedValue(
        Result.ok({
          assignmentId: "assign-1",
          staffId: checkinStaffRecord.staffId,
          workshopIds: ["ws-1", "ws-2"],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const result = await authService.getMe(
        checkinStaffRecord.staffId,
        "CHECKIN_STAFF"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("CHECKIN_STAFF");
      expect(result.data.allowedWorkshopIds).toEqual(["ws-1", "ws-2"]);
    });

    it("returns FailResult with USER_NOT_FOUND when student does not exist", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authService.getMe("nonexistent", "STUDENT");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when staff lookup fails", async () => {
      mockStaffRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await authService.getMe("usr-1", "BTC");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("handles missing student profile gracefully for STUDENT", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authService.getMe(STUDENT_ID, "STUDENT");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("handles missing assignments gracefully for CHECKIN_STAFF", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentsRepo.findByStaffId.mockResolvedValue(Result.ok(null));

      const result = await authService.getMe(
        checkinStaffRecord.staffId,
        "CHECKIN_STAFF"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("CHECKIN_STAFF");
      expect(result.data.allowedWorkshopIds).toEqual([]);
    });
  });
});
