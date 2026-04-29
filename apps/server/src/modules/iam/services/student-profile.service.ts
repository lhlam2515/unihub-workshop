/**
 * Student Profile Service
 *
 * Truy xuất hồ sơ sinh viên:
 * - getProfileByUserId(userId)
 *
 * Dùng để compose response cho GET /auth/me khi role là STUDENT
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class StudentProfileService {
  constructor(
    private readonly studentsRepo: any // TODO: Inject StudentsRepository
  ) {}

  /**
   * getProfileByUserId(userId: string)
   *
   * TODO: Get student profile by user ID
   * - Query students table
   * - Return student entity or null
   */
  async getProfileByUserId(userId: string) {
    // TODO: Implement
  }
}
