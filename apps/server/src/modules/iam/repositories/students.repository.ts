import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { Student } from "@/database/types/identity.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

@Injectable()
export class StudentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Looks up a student profile by the linked user ID (uses idx_students_user_id index).
   *
   * Used by AuthService.getMe to compose STUDENT-specific response fields.
   *
   * @param userId - The user's system ID (foreign key on students.user_id).
   * @returns The student entity or null if no profile exists.
   */
  async findByUserId(userId: string): Promise<Result<Student | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.students)
          .where(eq(this.schema.students.userId, userId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Looks up a student profile by their institutional student code.
   *
   * Used during CSV-based student data synchronization.
   *
   * @param code - The student's unique code (e.g., "20210001").
   * @returns The student entity or null if not found.
   */
  async findByStudentCode(code: string): Promise<Result<Student | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.students)
          .where(eq(this.schema.students.studentCode, code))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
