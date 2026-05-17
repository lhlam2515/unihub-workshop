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
  // findById
  // -------------------------------------------------------------------------
  describe("findById", () => {
    it("returns OkResult with student when found by code", async () => {
      const student = {
        studentId: "stu-2",
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
    it("upserts a student", async () => {
      const student = {
        studentId: "20210003",
        fullName: "Alice Doe",
        email: "alice@edu.test",
      };
      setupDbResolve([student]);

      const result = await repository.upsert({
        studentId: "20210003",
        fullName: "Alice Doe",
        email: "alice@edu.test",
      });

      expect(result.isSuccess).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "20210003",
        })
      );
      const [upsertArgs] = mockDb.onConflictDoUpdate.mock.calls as Array<
        [
          {
            target: unknown;
            set: { fullName?: string };
          },
        ]
      >;

      expect(upsertArgs[0].target).toBe(mockSchema.students.studentId);
    });
  });
});
