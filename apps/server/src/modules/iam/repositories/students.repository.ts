import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { Student } from "@/infra/database/types/identity.types";
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

  /**
   * Upserts a student record by student_code.
   *
   * On conflict, updates the row. On insert, creates a new record.
   *
   * Side effects:
   * - Inserts or updates a row in the students table.
   *
   * @param data - Student fields to upsert.
   * @returns OkResult with the upserted Student record, or FailResult (INTERNAL_ERROR).
   */
  async upsertByStudentCode(data: {
    studentCode: string;
    fullName: string;
    emailEdu: string;
    faculty: string;
    classYear: number | null;
    userId?: string;
  }): Promise<Result<Student>> {
    return tryCatch(
      async () => {
        const insertValues = {
          studentCode: data.studentCode,
          fullName: data.fullName,
          emailEdu: data.emailEdu,
          faculty: data.faculty,
          classYear: data.classYear,
          lastSyncedAt: new Date(),
          ...(data.userId ? { userId: data.userId } : {}),
        };

        const updateValues = {
          fullName: data.fullName,
          emailEdu: data.emailEdu,
          faculty: data.faculty,
          classYear: data.classYear,
          lastSyncedAt: new Date(),
          ...(data.userId ? { userId: data.userId } : {}),
        };

        const [result] = await this.db
          .insert(this.schema.students)
          .values(insertValues)
          .onConflictDoUpdate({
            target: this.schema.students.studentCode,
            set: updateValues,
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
