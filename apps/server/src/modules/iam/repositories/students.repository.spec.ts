import { Test } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";

import { StudentsRepository } from "./students.repository";

describe("StudentsRepository", () => {
  let repository: StudentsRepository;
  let mockDb: Record<string, jest.Mock>;
  let mockSchema: { students: Record<string, unknown> };

  function setupDbResolve(value: unknown) {
    const promise = Promise.resolve(value);
    const thenHandler: PromiseLike<unknown>["then"] = (
      onfulfilled,
      onrejected
    ) => promise.then(onfulfilled, onrejected);
    const catchHandler: Promise<unknown>["catch"] = (onrejected) =>
      promise.catch(onrejected);

    Object.assign(mockDb, {
      then: thenHandler,
      catch: catchHandler,
    });
  }

  function setupDbReject(error: unknown) {
    const promise = Promise.reject(error);
    promise.catch(() => {}); // suppress unhandled rejection
    const thenHandler: PromiseLike<unknown>["then"] = (
      onfulfilled,
      onrejected
    ) => promise.then(onfulfilled, onrejected);
    const catchHandler: Promise<unknown>["catch"] = (onrejected) =>
      promise.catch(onrejected);

    Object.assign(mockDb, {
      then: thenHandler,
      catch: catchHandler,
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
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    mockSchema = {
      students: {
        studentId: "students.student_id",
        userId: "students.user_id",
        studentCode: "students.student_code",
        fullName: "students.full_name",
        faculty: "students.faculty",
        classYear: "students.class_year",
        emailEdu: "students.email_edu",
        lastSyncedAt: "students.last_synced_at",
        createdAt: "students.created_at",
        updatedAt: "students.updated_at",
      },
    };
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repository = module.get<StudentsRepository>(StudentsRepository);
  });

  // -------------------------------------------------------------------------
  // findByUserId
  // -------------------------------------------------------------------------
  describe("findByUserId", () => {
    it("returns OkResult with student when found", async () => {
      const student = {
        studentId: "stu-1",
        userId: "usr-1",
        studentCode: "20210001",
        fullName: "John Doe",
        faculty: "Engineering",
        classYear: 2021,
        emailEdu: "john@edu.test",
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([student]);

      const result = await repository.findByUserId("usr-1");

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.data).toEqual(student);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalledWith(mockSchema.students);
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("returns OkResult with null when no profile exists", async () => {
      setupDbResolve([]);

      const result = await repository.findByUserId("usr-nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("Connection lost");
      setupDbReject(dbError);

      const result = await repository.findByUserId("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe("findById", () => {
    it("returns OkResult with student when found by code", async () => {
      const student = {
        studentId: "stu-2",
        userId: "usr-2",
        studentCode: "20210002",
        fullName: "Jane Doe",
        faculty: "Science",
        classYear: 2021,
        emailEdu: "jane@edu.test",
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([student]);

      const result = await repository.findById("20210002");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(student);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("returns OkResult with null when code not found", async () => {
      setupDbResolve([]);

      const result = await repository.findById("NONEXISTENT");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("Timeout");
      setupDbReject(dbError);

      const result = await repository.findById("20210001");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // upsert
  // -------------------------------------------------------------------------
  describe("upsert", () => {
    it("upserts a student and links the user when userId is provided", async () => {
      const student = {
        studentId: "20210003",
        userId: "usr-3",
        fullName: "Alice Doe",
        email: "alice@edu.test",
      };
      setupDbResolve([student]);

      const result = await repository.upsert({
        studentId: "20210003",
        fullName: "Alice Doe",
        email: "alice@edu.test",
        userId: "usr-3",
      });

      expect(result.isSuccess).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "20210003",
          userId: "usr-3",
        })
      );
      const [upsertArgs] = mockDb.onConflictDoUpdate.mock.calls as Array<
        [
          {
            target: unknown;
            set: { userId?: string; fullName?: string };
          },
        ]
      >;

      expect(upsertArgs[0].target).toBe(mockSchema.students.studentId);
      expect(upsertArgs[0].set.userId).toBe("usr-3");
    });

    it("upserts a student without linking a user when userId is omitted", async () => {
      const student = {
        studentId: "20210004",
        userId: null,
        fullName: "Bob Doe",
        email: "bob@edu.test",
      };
      setupDbResolve([student]);

      const result = await repository.upsert({
        studentId: "20210004",
        fullName: "Bob Doe",
        email: "bob@edu.test",
      });

      expect(result.isSuccess).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.not.objectContaining({ userId: expect.anything() })
      );
      const [upsertArgs] = mockDb.onConflictDoUpdate.mock.calls as Array<
        [
          {
            target: unknown;
            set: Record<string, unknown>;
          },
        ]
      >;
      expect(upsertArgs[0].set.userId).toBeUndefined();
    });
  });
});
