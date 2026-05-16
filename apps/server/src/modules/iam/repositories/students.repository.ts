import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

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
   * Batch-upserts student records by student_id (TEXT PK).
   *
   * Designed for the CSV sync batch-upsert pipeline — inserts or updates
   * multiple student records in a single SQL statement (up to 500 rows
   * per batch).
   *
   * Business rules:
   * - Uses PostgreSQL `EXCLUDED` pseudo-table to reference per-row values
   *   in the ON CONFLICT DO UPDATE clause (unlike single-row upsert which
   *   passes static values).
   * - `userId` uses `COALESCE(excluded.user_id, students.user_id)` to
   *   preserve the existing linked user when the batch row has no userId.
   * - `password_hash` is never overwritten (not included in SET clause).
   *
   * Side effects:
   * - Inserts or updates multiple rows in the students table.
   *
   * @param data - Array of student fields to upsert (batch, max 500).
   * @returns OkResult with the upserted Student records, or FailResult (INTERNAL_ERROR).
   */
  async upsertBatch(
    data: Array<{
      studentId: string;
      fullName: string;
      email: string | null;
      userId?: string | null;
    }>
  ): Promise<Result<Student[]>> {
    return tryCatch(
      async (): Promise<Student[]> => {
        const result = await this.db
          .insert(this.schema.students)
          .values(
            data.map((d) => ({
              studentId: d.studentId,
              fullName: d.fullName,
              email: d.email,
              userId: d.userId ?? null,
            }))
          )
          .onConflictDoUpdate({
            target: this.schema.students.studentId,
            set: {
              fullName: sql`excluded.full_name`,
              email: sql`excluded.email`,
              updatedAt: new Date(),
              userId: sql`COALESCE(excluded.user_id, students.user_id)`,
            },
          })
          .returning();
        return result;
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
              updatedAt: new Date(),
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
