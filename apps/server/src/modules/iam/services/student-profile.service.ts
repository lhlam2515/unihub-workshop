import { Injectable } from "@nestjs/common";

import type { Student } from "@/infra/database/types/identity.types";
import { Result } from "@/shared/response/result";

import { StudentsRepository } from "../repositories/students.repository";

@Injectable()
export class StudentProfileService {
  constructor(private readonly studentsRepo: StudentsRepository) {}

  /**
   * Retrieves a student's profile by their student ID (MSSV).
   *
   * @param studentId - The student's unique code (MSSV, TEXT PK).
   * @returns OkResult containing the student entity, or null if not found.
   */
  async getProfileByStudentId(
    studentId: string
  ): Promise<Result<Student | null>> {
    return this.studentsRepo.findById(studentId);
  }
}
