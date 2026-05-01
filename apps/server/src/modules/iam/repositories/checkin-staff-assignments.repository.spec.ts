import { Test } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import { systemErrors } from "@/shared/response/errors";

import { CheckinStaffAssignmentsRepository } from "./checkin-staff-assignments.repository";

describe("CheckinStaffAssignmentsRepository", () => {
  let repository: CheckinStaffAssignmentsRepository;
  let mockDb: Record<string, jest.Mock>;
  let mockSchema: { checkinStaffAssignments: Record<string, unknown> };

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
      onConflictDoUpdate: jest.fn().mockReturnThis(),
    };

    mockSchema = {
      checkinStaffAssignments: {
        assignmentId: "checkin_staff_assignments.assignment_id",
        userId: "checkin_staff_assignments.user_id",
        workshopIds: "checkin_staff_assignments.workshop_ids",
        createdAt: "checkin_staff_assignments.created_at",
        updatedAt: "checkin_staff_assignments.updated_at",
      },
    };
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CheckinStaffAssignmentsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repository = module.get<CheckinStaffAssignmentsRepository>(
      CheckinStaffAssignmentsRepository
    );
  });

  // -------------------------------------------------------------------------
  // findByUserId
  // -------------------------------------------------------------------------
  describe("findByUserId", () => {
    it("returns OkResult with assignment when found", async () => {
      const assignment = {
        assignmentId: "assign-1",
        userId: "usr-staff-1",
        workshopIds: ["ws-1", "ws-2"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([assignment]);

      const result = await repository.findByUserId("usr-staff-1");

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.data).toEqual(assignment);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalledWith(
        mockSchema.checkinStaffAssignments
      );
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("returns OkResult with null when no assignment exists", async () => {
      setupDbResolve([]);

      const result = await repository.findByUserId("usr-nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query fails", async () => {
      const dbError = new Error("Connection lost");
      setupDbReject(dbError);

      const result = await repository.findByUserId("usr-staff-1");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });

  // -------------------------------------------------------------------------
  // upsert
  // -------------------------------------------------------------------------
  describe("upsert", () => {
    it("returns OkResult with created assignment on insert", async () => {
      const newAssignment = {
        assignmentId: "assign-new",
        userId: "usr-staff-2",
        workshopIds: ["ws-3"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([newAssignment]);

      const result = await repository.upsert("usr-staff-2", ["ws-3"]);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(newAssignment);
      expect(mockDb.insert).toHaveBeenCalledWith(
        mockSchema.checkinStaffAssignments
      );
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: "usr-staff-2",
        workshopIds: ["ws-3"],
      });
    });

    it("returns OkResult with updated assignment on conflict", async () => {
      const updatedAssignment = {
        assignmentId: "assign-1",
        userId: "usr-staff-1",
        workshopIds: ["ws-1", "ws-2", "ws-3"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setupDbResolve([updatedAssignment]);

      const result = await repository.upsert("usr-staff-1", [
        "ws-1",
        "ws-2",
        "ws-3",
      ]);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updatedAssignment);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: "usr-staff-1",
        workshopIds: ["ws-1", "ws-2", "ws-3"],
      });
    });

    it("returns FailResult on DB upsert failure", async () => {
      const dbError = new Error("Foreign key violation");
      setupDbReject(dbError);

      const result = await repository.upsert("usr-invalid", ["ws-1"]);

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(systemErrors.internal(dbError));
    });
  });
});
