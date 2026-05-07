import { Test } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";

import { UsersRepository } from "./users.repository";

describe("UsersRepository", () => {
  let repository: UsersRepository;
  let mockDb: Record<string, jest.Mock>;
  let mockSchema: { users: Record<string, unknown> };

  function setupDbResolve(value: unknown) {
    const promise = Promise.resolve(value);
    Object.assign(mockDb, {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    });
  }

  function setupDbReject(error: unknown) {
    const promise = Promise.reject(error);
    promise.catch(() => {}); // suppress unhandled rejection
    Object.assign(mockDb, {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    });
  }

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    mockSchema = {
      users: {
        userId: "users.user_id",
        email: "users.email",
        passwordHash: "users.password_hash",
        role: "users.role",
        status: "users.status",
        createdAt: "users.created_at",
        updatedAt: "users.updated_at",
      },
    };
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repository = module.get<UsersRepository>(UsersRepository);
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe("findById", () => {
    it("returns OkResult with user when found", async () => {
      const user = {
        userId: "usr-1",
        email: "john@test.com",
        passwordHash: "hashed-pw",
        role: "STUDENT",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([user]);

      const result = await repository.findById("usr-1");

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.data).toEqual(user);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalledWith(mockSchema.users);
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("returns OkResult with null when not found", async () => {
      setupDbResolve([]);

      const result = await repository.findById("usr-nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("Connection lost");
      setupDbReject(dbError);

      const result = await repository.findById("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // findByEmail
  // -------------------------------------------------------------------------
  describe("findByEmail", () => {
    it("returns OkResult with user when found", async () => {
      const user = {
        userId: "usr-2",
        email: "jane@test.com",
        passwordHash: "hashed-pw",
        role: "BTC",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([user]);

      const result = await repository.findByEmail("jane@test.com");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(user);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("returns OkResult with null when email not found", async () => {
      setupDbResolve([]);

      const result = await repository.findByEmail("unknown@test.com");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("Timeout");
      setupDbReject(dbError);

      const result = await repository.findByEmail("jane@test.com");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe("create", () => {
    it("returns OkResult with created user", async () => {
      const newUser = {
        email: "new@test.com",
        passwordHash: "hashed-pw",
        role: "STUDENT" as const,
        status: "PENDING_VERIFICATION" as const,
      };
      const createdUser = {
        userId: "usr-new",
        ...newUser,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([createdUser]);

      const result = await repository.create(newUser);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(createdUser);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.users);
      expect(mockDb.values).toHaveBeenCalledWith(newUser);
    });

    it("returns FailResult on DB insert failure", async () => {
      const dbError = new Error("Unique constraint violation");
      setupDbReject(dbError);

      const result = await repository.create({
        email: "dup@test.com",
        passwordHash: "hashed-pw",
        role: "STUDENT",
        status: "PENDING_VERIFICATION",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe("list", () => {
    const users = [
      {
        userId: "usr-1",
        email: "a@test.com",
        passwordHash: "hash",
        role: "STUDENT",
        status: "ACTIVE",
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date(),
      },
      {
        userId: "usr-2",
        email: "b@test.com",
        passwordHash: "hash",
        role: "STUDENT",
        status: "ACTIVE",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date(),
      },
    ];

    beforeEach(() => {
      // For list(), Promise.all calls two queries. We need the mockDb to
      // resolve with different values for each branch. Easiest approach:
      // mock the terminal method differently by overriding limit/offset.
      // Instead, we directly control the then callback to resolve correctly.
    });

    it("returns paginated users without role filter", async () => {
      // The list method runs Promise.all on two queries in sequence.
      // We override mockDb to resolve differently on each call.
      let callCount = 0;
      const promise = new Promise(() => {
        /* controlled below */
      });
      const thenable: Record<string, unknown> = {
        then: (onFulfilled: (value: unknown) => void) => {
          callCount++;
          if (callCount === 1) {
            // rows
            return Promise.resolve(users).then(onFulfilled);
          }
          // total count
          return Promise.resolve([{ count: 2 }]).then(onFulfilled);
        },
        catch: (onRejected: (reason: unknown) => void) =>
          promise.catch(onRejected),
      };
      Object.assign(mockDb, thenable);

      const result = await repository.list();

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items).toEqual(users);
      expect(result.data.total).toBe(2);
    });

    it("returns paginated users with role filter", async () => {
      let callCount = 0;
      const filteredUsers = users.filter((u) => u.role === "STUDENT");
      const thenable: Record<string, unknown> = {
        then: (onFulfilled: (value: unknown) => void) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(filteredUsers).then(onFulfilled);
          }
          return Promise.resolve([{ count: filteredUsers.length }]).then(
            onFulfilled
          );
        },
        catch: () => Promise.reject(new Error("never")).catch(() => {}),
      };
      Object.assign(mockDb, thenable);

      const result = await repository.list("STUDENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it("returns empty list when no users match", async () => {
      let callCount = 0;
      const thenable: Record<string, unknown> = {
        then: (onFulfilled: (value: unknown) => void) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([]).then(onFulfilled);
          }
          return Promise.resolve([{ count: 0 }]).then(onFulfilled);
        },
        catch: () => Promise.reject(new Error("never")).catch(() => {}),
      };
      Object.assign(mockDb, thenable);

      const result = await repository.list("CHECKIN_STAFF");

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("DB failure");
      const promise = Promise.reject(dbError);
      promise.catch(() => {});
      Object.assign(mockDb, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
      });

      const result = await repository.list();

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });

    it("applies pagination offset correctly", async () => {
      let callCount = 0;
      const thenable: Record<string, unknown> = {
        then: (onFulfilled: (value: unknown) => void) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(users).then(onFulfilled);
          }
          return Promise.resolve([{ count: 10 }]).then(onFulfilled);
        },
        catch: () => Promise.reject(new Error("never")).catch(() => {}),
      };
      Object.assign(mockDb, thenable);

      await repository.list(undefined, 2, 10);

      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(mockDb.offset).toHaveBeenCalledWith(10); // (page - 1) * limit = 10
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------
  describe("updateStatus", () => {
    it("returns OkResult with updated user", async () => {
      const updatedUser = {
        userId: "usr-1",
        email: "john@test.com",
        passwordHash: "hash",
        role: "STUDENT",
        status: "SUSPENDED",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([updatedUser]);

      const result = await repository.updateStatus("usr-1", "SUSPENDED");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updatedUser);
      expect(mockDb.update).toHaveBeenCalledWith(mockSchema.users);
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "SUSPENDED" })
      );
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("returns OkResult with undefined when user not found", async () => {
      setupDbResolve([undefined]);

      const result = await repository.updateStatus("usr-none", "SUSPENDED");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it("returns FailResult on DB update failure", async () => {
      const dbError = new Error("Update failed");
      setupDbReject(dbError);

      const result = await repository.updateStatus("usr-1", "ACTIVE");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
