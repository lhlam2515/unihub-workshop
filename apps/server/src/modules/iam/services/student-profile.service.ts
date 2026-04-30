import { Injectable } from "@nestjs/common";

import type { Student } from "@/database/types/identity.types";
import { Result } from "@/shared/response/result";

import { StudentsRepository } from "../repositories/students.repository";

@Injectable()
export class StudentProfileService {
  constructor(private readonly studentsRepo: StudentsRepository) {}

  /**
   * Retrieves a student's profile by their linked user ID.
   *
   * Composes the STUDENT-specific fields (student_code, full_name, faculty) for
   * the GET /auth/me endpoint.
   *
   * @param userId - The user's system ID (foreign key in students table).
   * @returns OkResult containing the student entity, or null if no profile exists.
   */
  async getProfileByUserId(userId: string): Promise<Result<Student | null>> {
    return this.studentsRepo.findByUserId(userId);
  }
}
