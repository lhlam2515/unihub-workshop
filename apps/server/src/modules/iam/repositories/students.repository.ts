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
   * Looks up a student profile by the linked user ID.
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
   * Looks up a student profile by their institutional student ID (TEXT PK).
   *
   * Used during CSV-based student data synchronization.
   *
   * @param studentId - The student's unique code (e.g., "20210001").
   * @returns The student entity or null if not found.
   */
  async findById(studentId: string): Promise<Result<Student | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.students)
          .where(eq(this.schema.students.studentId, studentId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Upserts a student record by student_id (TEXT PK).
   *
   * On conflict (same studentId), updates the row. On insert, creates a new record.
   *
   * Side effects:
   * - Inserts or updates a row in the students table.
   *
   * @param data - Student fields to upsert.
   * @returns OkResult with the upserted Student record, or FailResult (INTERNAL_ERROR).
   */
  async upsert(data: {
    studentId: string;
    fullName: string;
    email?: string;
    userId?: string;
  }): Promise<Result<Student>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.students)
          .values({
            studentId: data.studentId,
            fullName: data.fullName,
            email: data.email ?? null,
            ...(data.userId ? { userId: data.userId } : {}),
          })
          .onConflictDoUpdate({
            target: this.schema.students.studentId,
            set: {
              fullName: data.fullName,
              email: data.email ?? null,
              ...(data.userId ? { userId: data.userId } : {}),
            },
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
