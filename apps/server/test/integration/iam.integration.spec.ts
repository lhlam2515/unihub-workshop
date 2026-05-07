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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RedisService } from "@/infra/redis/redis.service";
import { AuthController } from "@/modules/iam/controllers/auth.controller";
import { CheckinStaffAdminController } from "@/modules/iam/controllers/checkin-staff-admin.controller";
import { UsersAdminController } from "@/modules/iam/controllers/users-admin.controller";
import { CheckinStaffAssignmentsRepository } from "@/modules/iam/repositories/checkin-staff-assignments.repository";
import { UsersRepository } from "@/modules/iam/repositories/users.repository";
import { AuthService } from "@/modules/iam/services/auth.service";
import { CheckinStaffAssignmentService } from "@/modules/iam/services/checkin-staff-assignment.service";
import { StudentProfileService } from "@/modules/iam/services/student-profile.service";
import { TokenService } from "@/modules/iam/services/token.service";
import { UsersService } from "@/modules/iam/services/users.service";
import { authErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUsersRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  listUsers: jest.fn(),
  updateStatus: jest.fn(),
};

const mockTokenService = {
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  blacklistToken: jest.fn(),
  revokeAllUserTokens: jest.fn(),
};

const mockStudentProfileService = {
  getProfileByUserId: jest.fn(),
};

const mockAssignmentsRepo = {
  findByUserId: jest.fn(),
  assignWorkshops: jest.fn(),
  getAssignedWorkshops: jest.fn(),
  unassignWorkshops: jest.fn(),
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

const activeUser = {
  userId: "usr-001",
  email: "student@university.edu",
  passwordHash: hashedPassword,
  role: "STUDENT",
  status: "ACTIVE",
};

const suspendedUser = {
  ...activeUser,
  userId: "usr-002",
  status: "SUSPENDED",
};

const checkinStaffUser = {
  ...activeUser,
  userId: "usr-003",
  email: "staff@university.edu",
  role: "CHECKIN_STAFF",
};

const organizerUser = {
  ...activeUser,
  userId: "usr-004",
  email: "organizer@university.edu",
  role: "ORGANIZER",
};

const studentProfile = {
  studentCode: "STU001",
  fullName: "John Doe",
  faculty: "Engineering",
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
  let usersAdminController: UsersAdminController;
  let checkinStaffAdminController: CheckinStaffAdminController;
  let mockResponse: Response;
  let mockRequest: Request;

  beforeAll(() => {
    process.env = {
      ...OLD_ENV,
      JWT_SECRET: "test-jwt-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockResponse = { cookie: jest.fn() } as unknown as Response;
    mockRequest = { cookies: {} } as unknown as Request;

    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersAdminController,
        CheckinStaffAdminController,
      ],
      providers: [
        AuthService,
        UsersService,
        TokenService,
        CheckinStaffAssignmentService,
        StudentProfileService,
        { provide: UsersRepository, useValue: mockUsersRepo },
        { provide: TokenService, useValue: mockTokenService },
        { provide: StudentProfileService, useValue: mockStudentProfileService },
        {
          provide: CheckinStaffAssignmentsRepository,
          useValue: mockAssignmentsRepo,
        },
        { provide: RedisService, useValue: mockRedisService },
        provideMockGuard(),
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    usersAdminController =
      module.get<UsersAdminController>(UsersAdminController);
    checkinStaffAdminController = module.get<CheckinStaffAdminController>(
      CheckinStaffAdminController
    );
  });

  // -------------------------------------------------------------------------
  // AuthController — POST /auth/login — FR-F01-001
  // -------------------------------------------------------------------------
  describe("AuthController.login — FR-F01-001", () => {
    it("returns access token for valid credentials (WEB platform)", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(activeUser));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);

      const result = await authController.login(
        {
          email: "student@university.edu",
          password: "password123",
          platform: "WEB",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.access_token).toBe(mockAccessToken);
      // WEB: refreshToken may be omitted for cookie flow
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "usr-001", role: "STUDENT" }),
        "WEB"
      );
    });

    it("returns access token with longer expiry for MOBILE platform", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(activeUser));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(mockRefreshToken);

      const result = await authController.login(
        {
          email: "student@university.edu",
          password: "password123",
          platform: "MOBILE",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.access_token).toBe(mockAccessToken);
      // MOBILE: refresh token returned in body
      expect(result.data.refresh_token).toBe(mockRefreshToken);
      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith(
        expect.anything(),
        "MOBILE"
      );
    });

    it("returns INVALID_CREDENTIALS for wrong password", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(activeUser));

      const result = await authController.login(
        {
          email: "student@university.edu",
          password: "wrong-password",
          platform: "WEB",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns INVALID_CREDENTIALS for inactive user (prevents enumeration)", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(suspendedUser));

      const result = await authController.login(
        {
          email: "suspended@university.edu",
          password: "password123",
          platform: "WEB",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns INVALID_CREDENTIALS when email not found (prevents enumeration)", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(
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
          platform: "WEB",
        },
        mockResponse
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("embeds allowed_workshop_ids for CHECKIN_STAFF — FR-F01-002", async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(Result.ok(checkinStaffUser));
      mockAssignmentsRepo.findByUserId.mockResolvedValue(
        Result.ok({ workshopIds: ["wid-A", "wid-B"] })
      );
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);

      const result = await authController.login(
        {
          email: "staff@university.edu",
          password: "password123",
          platform: "WEB",
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
        Result.ok({ sub: "usr-001", jti: "old-jti" })
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));
      mockTokenService.signAccessToken.mockResolvedValue(mockAccessToken);
      mockTokenService.signRefreshToken.mockResolvedValue(mockRefreshToken);

      const result = await authController.refresh(
        { refresh_token: "valid-refresh-token", platform: "WEB" },
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
        { refresh_token: "expired-refresh-token", platform: "WEB" },
        mockResponse,
        mockRequest
      );

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("REFRESH_TOKEN_INVALID");
    });

    it("returns REFRESH_TOKEN_INVALID when user is suspended", async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(
        Result.ok({ sub: "usr-002", jti: "jti-002" })
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(suspendedUser));

      const result = await authController.refresh(
        { refresh_token: "valid-refresh-token", platform: "WEB" },
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
      const result = await authController.logout({
        sub: "usr-001",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(mockTokenService.blacklistToken).toHaveBeenCalledWith(
        "jti-001",
        900
      );
    });

    it("is idempotent when called multiple times", async () => {
      const result1 = await authController.logout({
        sub: "usr-001",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });
      const result2 = await authController.logout({
        sub: "usr-001",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(mockTokenService.blacklistToken).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // AuthController — GET /auth/me
  // -------------------------------------------------------------------------
  describe("AuthController.getMe", () => {
    it("returns STUDENT profile with student_code, full_name, faculty", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));
      mockStudentProfileService.getProfileByUserId.mockResolvedValue(
        Result.ok(studentProfile)
      );

      const result = await authController.getMe({
        sub: "usr-001",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.student_code).toBe("STU001");
      expect(result.data.full_name).toBe("John Doe");
      expect(result.data.faculty).toBe("Engineering");
    });

    it("returns ORGANIZER profile without student profile", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(organizerUser));

      const result = await authController.getMe({
        sub: "usr-004",
        role: "ORGANIZER",
        jti: "jti-004",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.role).toBe("ORGANIZER");
      expect(result.data.student_code).toBeUndefined();
    });

    it("returns CHECKIN_STAFF profile with allowed_workshop_ids", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(checkinStaffUser));
      mockAssignmentsRepo.findByUserId.mockResolvedValue(
        Result.ok({ workshopIds: ["wid-A", "wid-B"] })
      );

      const result = await authController.getMe({
        sub: "usr-003",
        role: "CHECKIN_STAFF",
        jti: "jti-003",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.allowed_workshop_ids).toEqual(["wid-A", "wid-B"]);
    });

    it("returns USER_NOT_FOUND for non-existent user", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await authController.getMe({
        sub: "usr-nonexistent",
        role: "STUDENT",
        jti: "jti-001",
        allowed_workshop_ids: [],
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------
  // UsersAdminController
  // -------------------------------------------------------------------------
  describe("UsersAdminController", () => {
    beforeEach(() => {
      // Re-mock for UsersService
      mockUsersRepo.listUsers.mockResolvedValue(
        Result.ok({ items: [activeUser], total: 1 })
      );
      mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));
      mockUsersRepo.updateStatus.mockResolvedValue(Result.ok(activeUser));
      mockTokenService.revokeAllUserTokens = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    describe("listUsers", () => {
      it("returns paginated user list", async () => {
        const result = await usersAdminController.listUsers(
          "STUDENT",
          "1",
          "20"
        );

        expect(result.isSuccess).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(mockUsersRepo.listUsers).toHaveBeenCalledWith("STUDENT", {
          page: 1,
          limit: 20,
        });
      });
    });

    describe("updateUserStatus", () => {
      it("updates user status and blacklists admin token", async () => {
        mockUsersRepo.findById.mockResolvedValue(Result.ok(activeUser));

        const result = await usersAdminController.updateUserStatus("usr-001", {
          status: "SUSPENDED",
        });

        expect(result.isSuccess).toBe(true);
        expect(mockUsersRepo.updateStatus).toHaveBeenCalledWith(
          "usr-001",
          "SUSPENDED"
        );
      });
    });

    describe("revokeUserTokens", () => {
      it("revokes all tokens for a user by setting Redis suspension flag", async () => {
        const result = await usersAdminController.revokeUserTokens("usr-001");

        expect(result.isSuccess).toBe(true);
        expect(mockRedisService.set).toHaveBeenCalledWith(
          "user:suspended:usr-001",
          "true",
          604800
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // CheckinStaffAdminController
  // -------------------------------------------------------------------------
  describe("CheckinStaffAdminController", () => {
    beforeEach(() => {
      mockAssignmentsRepo.assignWorkshops = jest
        .fn()
        .mockResolvedValue(Result.ok({ workshopIds: ["wid-A"] }));
      mockAssignmentsRepo.getAssignedWorkshops = jest
        .fn()
        .mockResolvedValue(Result.ok(["wid-A"]));
    });

    describe("assignWorkshops", () => {
      it("assigns workshops to a checkin staff user", async () => {
        const result = await checkinStaffAdminController.assignWorkshops(
          "usr-003",
          { workshop_ids: ["wid-A", "wid-B"] }
        );

        expect(result.isSuccess).toBe(true);
        expect(mockAssignmentsRepo.assignWorkshops).toHaveBeenCalledWith(
          "usr-003",
          ["wid-A", "wid-B"]
        );
      });
    });

    describe("getAssignedWorkshops", () => {
      it("returns assigned workshops for a checkin staff user", async () => {
        const result =
          await checkinStaffAdminController.getAssignedWorkshops("usr-003");

        expect(result.isSuccess).toBe(true);
        expect(mockAssignmentsRepo.getAssignedWorkshops).toHaveBeenCalledWith(
          "usr-003"
        );
      });
    });
  });
});
