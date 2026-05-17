import { Test } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { CheckinStaffAssignmentService } from "./checkin-staff-assignment.service";
import { CheckinStaffAssignmentsRepository } from "../repositories/checkin-staff-assignments.repository";
import { StaffRepository } from "../repositories/staff.repository";

describe("CheckinStaffAssignmentService", () => {
  let service: CheckinStaffAssignmentService;
  let mockAssignmentRepo: Record<string, jest.Mock>;
  let mockStaffRepo: Record<string, jest.Mock>;

  const checkinStaffRecord = {
    staffId: "usr-staff",
    email: "staff@test.com",
    fullName: "Staff User",
    passwordHash: "hash",
    role: "CHECKIN_STAFF" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const nonStaffRecord = {
    staffId: "usr-student",
    email: "student@test.com",
    fullName: "Student User",
    passwordHash: "hash",
    role: "STUDENT" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAssignment = {
    assignmentId: "assign-1",
    staffId: "usr-staff",
    workshopIds: ["ws-1", "ws-2"],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockAssignmentRepo = {
      findByStaffId: jest.fn(),
      upsert: jest.fn(),
    };

    mockStaffRepo = {
      findById: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CheckinStaffAssignmentService,
        {
          provide: CheckinStaffAssignmentsRepository,
          useValue: mockAssignmentRepo,
        },
        { provide: StaffRepository, useValue: mockStaffRepo },
      ],
    }).compile();

    service = module.get<CheckinStaffAssignmentService>(
      CheckinStaffAssignmentService
    );
  });

  // -------------------------------------------------------------------------
  // assignWorkshops
  // -------------------------------------------------------------------------
  describe("assignWorkshops", () => {
    it("assigns workshops to CHECKIN_STAFF user and returns warning", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentRepo.upsert.mockResolvedValue(Result.ok(mockAssignment));

      const result = await service.assignWorkshops("usr-staff", [
        "ws-1",
        "ws-2",
      ]);

      expect(result.isSuccess).toBe(true);
      expect(result.data.staffId).toBe("usr-staff");
      expect(result.data.workshopIds).toEqual(["ws-1", "ws-2"]);
      expect(result.data.warning).toContain("next login");
      expect(mockAssignmentRepo.upsert).toHaveBeenCalledWith("usr-staff", [
        "ws-1",
        "ws-2",
      ]);
    });

    it("returns FailResult with USER_NOT_FOUND when user does not exist", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.assignWorkshops("usr-nonexistent", ["ws-1"]);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns FailResult when user lookup fails", async () => {
      mockStaffRepo.findById.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await service.assignWorkshops("usr-staff", ["ws-1"]);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns FailResult with VALIDATION_FAILED when user is not CHECKIN_STAFF", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(nonStaffRecord));

      const result = await service.assignWorkshops("usr-student", ["ws-1"]);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("not a check-in staff");
    });

    it("returns FailResult when upsert fails", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentRepo.upsert.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await service.assignWorkshops("usr-staff", ["ws-1"]);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });

    it("replaces existing workshops (not a merge)", async () => {
      mockStaffRepo.findById.mockResolvedValue(Result.ok(checkinStaffRecord));
      mockAssignmentRepo.upsert.mockResolvedValue(Result.ok(mockAssignment));

      await service.assignWorkshops("usr-staff", ["ws-3"]);

      // Should replace, not merge
      expect(mockAssignmentRepo.upsert).toHaveBeenCalledWith("usr-staff", [
        "ws-3",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // getAssignedWorkshops
  // -------------------------------------------------------------------------
  describe("getAssignedWorkshops", () => {
    it("returns workshop IDs when assignment exists", async () => {
      mockAssignmentRepo.findByStaffId.mockResolvedValue(
        Result.ok(mockAssignment)
      );

      const result = await service.getAssignedWorkshops("usr-staff");

      expect(result.isSuccess).toBe(true);
      expect(result.data.workshopIds).toEqual(["ws-1", "ws-2"]);
    });

    it("returns empty array when no assignment exists", async () => {
      mockAssignmentRepo.findByStaffId.mockResolvedValue(Result.ok(null));

      const result = await service.getAssignedWorkshops("usr-staff");

      expect(result.isSuccess).toBe(true);
      expect(result.data.workshopIds).toEqual([]);
    });

    it("returns FailResult when assignment lookup fails", async () => {
      mockAssignmentRepo.findByStaffId.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await service.getAssignedWorkshops("usr-staff");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
