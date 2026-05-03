import { Test } from "@nestjs/testing";

import { RedisService } from "@/shared/redis/redis.service";
import { Result } from "@/shared/response/result";

import { UsersService } from "./users.service";
import { UserResponseBuilder } from "../dto/user-response.dto";
import { UsersRepository } from "../repositories/users.repository";

describe("UsersService", () => {
  let usersService: UsersService;
  let mockUsersRepo: Record<string, jest.Mock>;
  let mockRedisService: Record<string, jest.Mock>;

  const rawUser = {
    userId: "usr-1",
    email: "john@test.com",
    passwordHash: "hashed-pw",
    role: "STUDENT" as const,
    status: "ACTIVE" as const,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date(),
  };

  const userDto = UserResponseBuilder.from(rawUser);

  beforeEach(async () => {
    mockUsersRepo = {
      list: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepo },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  // -------------------------------------------------------------------------
  // listUsers
  // -------------------------------------------------------------------------
  describe("listUsers", () => {
    it("returns paginated users with default pagination", async () => {
      mockUsersRepo.list.mockResolvedValue(
        Result.ok({ items: [rawUser], total: 1 })
      );

      const result = await usersService.listUsers();

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toEqual([userDto]);
      expect(result.data.total).toBe(1);
      expect(mockUsersRepo.list).toHaveBeenCalledWith(undefined, 1, 20);
    });

    it("returns paginated users with custom pagination", async () => {
      mockUsersRepo.list.mockResolvedValue(
        Result.ok({ items: [rawUser], total: 1 })
      );

      const result = await usersService.listUsers("STUDENT", {
        page: 2,
        limit: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(mockUsersRepo.list).toHaveBeenCalledWith("STUDENT", 2, 10);
    });

    it("returns empty items when no users match", async () => {
      mockUsersRepo.list.mockResolvedValue(Result.ok({ items: [], total: 0 }));

      const result = await usersService.listUsers("CHECKIN_STAFF");

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it("returns FailResult when list query fails", async () => {
      mockUsersRepo.list.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await usersService.listUsers();

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // getUserById
  // -------------------------------------------------------------------------
  describe("getUserById", () => {
    it("returns OkResult with user DTO when found", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(rawUser));

      const result = await usersService.getUserById("usr-1");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(userDto);
    });

    it("returns FailResult with USER_NOT_FOUND when user does not exist", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await usersService.getUserById("usr-nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when findById query fails", async () => {
      mockUsersRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await usersService.getUserById("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // updateUserStatus
  // -------------------------------------------------------------------------
  describe("updateUserStatus", () => {
    it("sets Redis suspension flag when SUSPENDED", async () => {
      const updatedRaw = { ...rawUser, status: "SUSPENDED" as const };
      mockUsersRepo.updateStatus.mockResolvedValue(Result.ok(updatedRaw));

      const result = await usersService.updateUserStatus("usr-1", "SUSPENDED");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SUSPENDED");
      expect(mockRedisService.set).toHaveBeenCalledWith(
        "user:suspended:usr-1",
        "true",
        604800
      );
    });

    it("clears Redis suspension flag when ACTIVE", async () => {
      const updatedRaw = { ...rawUser, status: "ACTIVE" as const };
      mockUsersRepo.updateStatus.mockResolvedValue(Result.ok(updatedRaw));

      const result = await usersService.updateUserStatus("usr-1", "ACTIVE");

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("ACTIVE");
      expect(mockRedisService.del).toHaveBeenCalledWith("user:suspended:usr-1");
    });

    it("returns FailResult with USER_NOT_FOUND when user does not exist", async () => {
      mockUsersRepo.updateStatus.mockResolvedValue(Result.ok(undefined));

      const result = await usersService.updateUserStatus(
        "usr-none",
        "SUSPENDED"
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when updateStatus query fails", async () => {
      mockUsersRepo.updateStatus.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await usersService.updateUserStatus("usr-1", "ACTIVE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // revokeUserTokens
  // -------------------------------------------------------------------------
  describe("revokeUserTokens", () => {
    it("returns confirmation message when user exists", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(rawUser));

      const result = await usersService.revokeUserTokens("usr-1");

      expect(result.isSuccess).toBe(true);
      expect(result.data.message).toContain("All active sessions revoked");
    });

    it("returns FailResult with USER_NOT_FOUND when user does not exist", async () => {
      mockUsersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await usersService.revokeUserTokens("usr-nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when findById query fails", async () => {
      mockUsersRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await usersService.revokeUserTokens("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
