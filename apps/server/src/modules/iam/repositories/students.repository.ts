/**
 * Students Repository
 *
 * Truy xuất profile sinh viên từ bảng students.
 * Methods:
 * - findByUserId(userId)
 * - findByStudentCode(code)
 * - Hỗ trợ JOIN với users để compose response
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from '@database';
import { Injectable, Inject } from '@nestjs/common';

import type { DatabaseClient, DatabaseSchema } from '@database';

@Injectable()
export class StudentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findByUserId(userId: string): Promise<Student | null>
   */
  async findByUserId(userId: string) {
    // TODO: Query students table WHERE user_id = ?
  }

  /**
   * findByStudentCode(code: string): Promise<Student | null>
   */
  async findByStudentCode(code: string) {
    // TODO: Query students table WHERE student_code = ?
  }
}
