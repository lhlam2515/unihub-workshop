import { Test } from "@nestjs/testing";

import { Result } from "@/shared/response/result";

import { StudentProfileService } from "./student-profile.service";
import { StudentsRepository } from "../repositories/students.repository";

describe("StudentProfileService", () => {
  let service: StudentProfileService;
  let mockStudentsRepo: Record<string, jest.Mock>;

  const mockStudent = {
    studentId: "stu-1",
    userId: "usr-1",
    studentCode: "20210001",
    fullName: "John Doe",
    faculty: "Engineering",
    classYear: 2021,
    emailEdu: "john@edu.test",
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockStudentsRepo = {
      findByUserId: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        StudentProfileService,
        { provide: StudentsRepository, useValue: mockStudentsRepo },
      ],
    }).compile();

    service = module.get<StudentProfileService>(StudentProfileService);
  });

  // -------------------------------------------------------------------------
  // getProfileByUserId
  // -------------------------------------------------------------------------
  describe("getProfileByUserId", () => {
    it("returns OkResult with student when profile exists", async () => {
      mockStudentsRepo.findByUserId.mockResolvedValue(Result.ok(mockStudent));

      const result = await service.getProfileByUserId("usr-1");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockStudent);
    });

    it("returns OkResult with null when no profile exists", async () => {
      mockStudentsRepo.findByUserId.mockResolvedValue(Result.ok(null));

      const result = await service.getProfileByUserId("usr-nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when repository query fails", async () => {
      mockStudentsRepo.findByUserId.mockResolvedValue(
        Result.fail({
          category: "INTERNAL",
          code: "INTERNAL_ERROR",
          message: "DB error",
        })
      );

      const result = await service.getProfileByUserId("usr-1");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
