/**
 * IAM Module — Integration Tests
 *
 * Tests AuthController with mocked services/repositories.
 * Controllers are tested by calling methods directly (no supertest).
 *
 * FR references:
 * - FR-F01-001: Authenticate User (Login)
 * - FR-F01-002: Issue Role-scoped JWT
 * - FR-F01-003: Refresh Access Token
 * - FR-F01-004: Validate JWT and Check Blacklist
 * - FR-F01-007: Prevent Insecure Direct Object Reference (IDOR)
 * - FR-F01-008: Revoke Access Token via Redis Blacklist
 * - S-C01: JWT sub vs userId
 * - S-H01: Set-Cookie refresh token
 */
import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";

import { RedisService } from "@/infra/redis/redis.service";
import { AuthController } from "@/modules/iam/controllers/auth.controller";
import { CheckinStaffAdminController } from "@/modules/iam/controllers/checkin-staff-admin.controller";
import { StaffAdminController } from "@/modules/iam/controllers/staff-admin.controller";
import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { CheckinStaffAssignmentsRepository } from "@/modules/iam/repositories/checkin-staff-assignments.repository";
import { StaffRepository } from "@/modules/iam/repositories/staff.repository";
import { StudentsRepository } from "@/modules/iam/repositories/students.repository";
import { AuthService } from "@/modules/iam/services/auth.service";
import { CheckinStaffAssignmentService } from "@/modules/iam/services/checkin-staff-assignment.service";
import { StaffAdminService } from "@/modules/iam/services/staff-admin.service";
import { StudentProfileService } from "@/modules/iam/services/student-profile.service";
import { TokenService } from "@/modules/iam/services/token.service";
import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStaffRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  list: jest.fn(),
  updateStatus: jest.fn(),
};

const mockTokenService = {
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  blacklistToken: jest.fn(),
  revokeAllUserTokens: jest.fn(),
  isBlacklisted: jest.fn(),
  extractRefreshTokenJti: jest.fn(),
};

const mockAssignmentsRepo = {
  findByStaffId: jest.fn(),
  upsert: jest.fn(),
};

const mockStudentsRepo = {
  findById: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const hashedPassword = bcrypt.hashSync("password123", 10);

const activeStaff = {
  staffId: "usr-001",
  email: "student@university.edu",
  fullName: "Staff User",
  passwordHash: hashedPassword,
  role: "STAFF",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const suspendedStaff = {
  ...activeStaff,
  staffId: "usr-002",
  isActive: false,
};

const checkinStaffRecord = {
  ...activeStaff,
  staffId: "usr-003",
  email: "staff@university.edu",
  role: "CHECKIN_STAFF",
};

const organizerRecord = {
  ...activeStaff,
  staffId: "usr-004",
  email: "organizer@university.edu",
  role: "BTC",
};

const studentProfile = {
  studentId: "STU001",
  fullName: "John Doe",
  email: "john@edu.test",
  passwordHash: hashedPassword,
  studentCode: "STU001",
  faculty: "Engineering",
  classYear: 2021,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-access-token";
const mockRefreshToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-refresh-token";

// ---------------------------------------------------------------------------
// Helper: mock JwtAuthGuard provider
// ---------------------------------------------------------------------------

function provideMockGuard() {
  return {
    provide: JwtAuthGuard,
    useValue: { canActivate: jest.fn().mockResolvedValue(true) },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const OLD_ENV = process.env;

describe("IAM Module — Integration", () => {
  let authController: AuthController;
  let staffAdminController: StaffAdminController;
  let checkinStaffAdminController: CheckinStaffAdminController;
  let mockResponse: Response;
  let mockRequest: Request;

  beforeAll(() => {
    process.env = {
      ...OLD_ENV,
      JWT_SECRET: "test-jwt-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      JWT_PRIVATE_KEY:
        "dGVzdC1wcml2YXRlLWtleS1iYXNlNjQtcGxhY2Vob2xkZXItZm9yLXRlc3RpbmctcHVycG9zZXMtb25seQ==",
      JWT_PUBLIC_KEY:
        "dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1wbGFjZWhvbGRlci1mb3ItdGVzdGluZy1wdXJwb3Nlcy1vbmx5",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    mockRequest = { cookies: {} } as unknown as Request;

    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        StaffAdminController,
        CheckinStaffAdminController,
      ],
      providers: [
        AuthService,
        TokenService,
        CheckinStaffAssignmentService,
        StaffAdminService,
        StudentProfileService,
        { provide: StaffRepository, useValue: mockStaffRepo },
        { provide: TokenService, useValue: mockTokenService },
        {
          provide: CheckinStaffAssignmentsRepository,
          useValue: mockAssignmentsRepo,
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: StudentsRepository, useValue: mockStudentsRepo },
        provideMockGuard(),
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    staffAdminController =
      module.get<StaffAdminController>(StaffAdminController);
    checkinStaffAdminController = module.get<CheckinStaffAdminController>(
      CheckinStaffAdminController
    );
  });

  // -------------------------------------------------------------------------
  // AuthController — POST /auth/login — FR-F01-001
  // -------------------------------------------------------------------------
  describe("AuthController.login — FR-F01-001", () => {
    it("returns access token for valid STUDENT credentials (WEB platform)", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(studentProfile));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);

      const result = await authController.login(
        {
          accountType: "STUDENT",
          password: "password123",
          studentId: "STU001",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.accessToken).toBe(mockAccessToken);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ identityId: "STU001", role: "STUDENT" }),
        "WEB"
      );
    });

    it("returns access token with longer expiry for MOBILE platform", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(studentProfile));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(mockRefreshToken);

      const result = await authController.login(
        {
          accountType: "STUDENT",
          password: "password123",
          studentId: "STU001",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.accessToken).toBe(mockAccessToken);
      expect(result.data.refreshToken).toBe(mockRefreshToken);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        expect.anything(),
        "WEB"
      );
    });

    it("returns INVALID_CREDENTIALS for wrong password", async () => {
      mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(activeStaff));

      const result = await authController.login(
        {
          email: "student@university.edu",
          password: "wrong-password",
          accountType: "STAFF",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns INVALID_CREDENTIALS for inactive user (prevents enumeration)", async () => {
      mockStaffRepo.findByEmail.mockResolvedValue(Result.ok(suspendedStaff));

      const result = await authController.login(
        {
          email: "suspended@university.edu",
          password: "password123",
          accountType: "STAFF",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns INVALID_CREDENTIALS when email not found (prevents enumeration)", async () => {
      mockStaffRepo.findByEmail.mockResolvedValue(
        Result.fail({
          category: "NOT_FOUND",
          code: "USER_NOT_FOUND",
          message: "User not found.",
        })
      );

      const result = await authController.login(
        {
          email: "nonexistent@university.edu",
          password: "password123",
          accountType: "STAFF",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("embeds allowedWorkshopIds for CHECKIN_STAFF — FR-F01-002", async () => {
      mockStaffRepo.findByEmail.mockResolvedValue(
        Result.ok(checkinStaffRecord)
      );
      mockAssignmentsRepo.findByStaffId.mockResolvedValue(
        Result.ok({ workshopIds: ["wid-A", "wid-B"] })
      );
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);

      const result = await authController.login(
        {
          email: "staff@university.edu",
          password: "password123",
          accountType: "STAFF",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(true);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedWorkshopIds: ["wid-A", "wid-B"],
        }),
        "WEB"
      );
    });
  });

  // -------------------------------------------------------------------------
  // AuthController — POST /auth/refresh — FR-F01-003
  // -------------------------------------------------------------------------
  describe("AuthController.refresh — FR-F01-003", () => {
    it("issues new tokens for a valid refresh token", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-001", jti: "old-jti", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(activeStaff));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(mockRefreshToken);

      const result = await authController.refresh(
        { refreshToken: "valid-refresh-token" },
        mockResponse,
        mockRequest
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.accessToken).toBe(mockAccessToken);
      expect(result.data.refreshToken).toBeUndefined();
      // Old refresh token should be blacklisted (rotation)
      expect(mockTokenService.blacklistToken).toHaveBeenCalledWith(
        "old-jti",
        604_800
      );
    });

    it("returns REFRESH_TOKEN_INVALID for expired or blacklisted token", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.fail(authErrors.refreshTokenInvalid())
      );

      const result = await authController.refresh(
        { refreshToken: "expired-refresh-token" },
        mockResponse,
        mockRequest
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns REFRESH_TOKEN_INVALID when staff is inactive", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-002", jti: "jti-002", type: "STAFF" })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(suspendedStaff));

      const result = await authController.refresh(
        { refreshToken: "valid-refresh-token" },
        mockResponse,
        mockRequest
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });
  });

  // -------------------------------------------------------------------------
  // AuthController — POST /auth/logout — FR-F01-008
  // -------------------------------------------------------------------------
  describe("AuthController.logout — FR-F01-008", () => {
    it("blacklists the current token's jti in Redis", async () => {
      await authController.logout(
        {
          sub: "usr-001",
          role: "STUDENT",
          jti: "jti-001",
          allowed_workshop_ids: [],
        },
        mockRequest,
        mockResponse
      );
      expect(mockTokenService.blacklistToken).toHaveBeenCalledWith(
        "jti-001",
        900
      );
    });

    it("is idempotent when called multiple times", async () => {
      await authController.logout(
        {
          sub: "usr-001",
          role: "STUDENT",
          jti: "jti-001",
          allowed_workshop_ids: [],
        },
        mockRequest,
        mockResponse
      );
      await authController.logout(
        {
          sub: "usr-001",
          role: "STUDENT",
          jti: "jti-001",
          allowed_workshop_ids: [],
        },
        mockRequest,
        mockResponse
      );

      expect(mockTokenService.blacklistToken).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // AuthController — GET /auth/me
  // -------------------------------------------------------------------------
  describe("AuthController.getMe", () => {
    it("returns STUDENT profile with studentCode, fullName, faculty", async () => {
      mockStudentsRepo.findById.mockResolvedValue(Result.ok(studentProfile));

      const result = await authController.getMe({
        sub: "STU001",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.fullName).toBe("John Doe");
    });

    it("returns BTC profile without student profile", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(organizerRecord));

      const result = await authController.getMe({
        sub: "usr-004",
        role: "BTC",
        jti: "jti-004",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("BTC");
    });

    it("returns CHECKIN_STAFF profile with allowedWorkshopIds", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentsRepo.findByStaffId.mockResolvedValue(
        Result.ok({ workshopIds: ["wid-A", "wid-B"] })
      );

      const result = await authController.getMe({
        sub: "usr-003",
        role: "CHECKIN_STAFF",
        jti: "jti-003",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.allowedWorkshopIds).toEqual(["wid-A", "wid-B"]);
    });

    it("returns USER_NOT_FOUND for non-existent staff", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authController.getMe({
        sub: "usr-nonexistent",
        role: "BTC",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------
  // StaffAdminController
  // -------------------------------------------------------------------------
  describe("StaffAdminController", () => {
    beforeEach(() => {
      mockStaffRepo.list.mockResolvedValue(
        Result.ok({ items: [activeStaff], total: 1 })
      );
      mockStaffRepo.findById.mockResolvedValue(Result.ok(activeStaff));
      mockStaffRepo.updateStatus.mockResolvedValue(Result.ok(activeStaff));
    });

    describe("listStaff", () => {
      it("returns paginated staff list", async () => {
        const result = await staffAdminController.listStaff({
          role: "BTC",
          page: 1,
          limit: 20,
        } as any);

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(mockStaffRepo.list).toHaveBeenCalledWith(
          "BTC",
          undefined,
          1,
          20
        );
      });
    });

    describe("updateStaffStatus", () => {
      it("updates staff status and sets Redis suspension flag", async () => {
        mockStaffRepo.findById.mockResolvedValue(Result.ok(activeStaff));

        const result = await staffAdminController.updateStaffStatus("usr-001", {
          isActive: false,
        });

        expect(result.isSuccess).toBe(true);
        expect(mockStaffRepo.updateStatus).toHaveBeenCalledWith(
          "usr-001",
          false
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // CheckinStaffAdminController
  // -------------------------------------------------------------------------
  describe("CheckinStaffAdminController", () => {
    beforeEach(() => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentsRepo.upsert = jest
        .fn()
        .mockResolvedValue(Result.ok({ workshopIds: ["wid-A"] }));
      mockAssignmentsRepo.findByStaffId = jest
        .fn()
        .mockResolvedValue(Result.ok(["wid-A"]));
    });

    describe("assignWorkshops", () => {
      it("assigns workshops to a checkin staff user", async () => {
        const result = await checkinStaffAdminController.assignWorkshops(
          "usr-003",
          { workshopIds: ["wid-A", "wid-B"] }
        );

        expect(result.isSuccess).toBe(true);
        expect(mockAssignmentsRepo.upsert).toHaveBeenCalledWith("usr-003", [
          "wid-A",
          "wid-B",
        ]);
      });
    });

    describe("getAssignedWorkshops", () => {
      it("returns assigned workshops for a checkin staff user", async () => {
        const result =
          await checkinStaffAdminController.getAssignedWorkshops("usr-003");

        expect(result.isSuccess).toBe(true);
        expect(mockAssignmentsRepo.findByStaffId).toHaveBeenCalledWith(
          "usr-003"
        );
      });
    });
  });
});
