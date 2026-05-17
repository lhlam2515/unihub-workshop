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
   * Looks up a student by their institutional student ID (TEXT PK).
   *
   * Used during login and CSV sync operations.
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
   * Designed for the CSV sync batch-upsert pipeline.
   *
   * Business rules:
   * - When provided, passwordHash is set on INSERT for new student accounts.
   * - On CONFLICT, passwordHash is never overwritten (not in SET clause).
   *
   * Side effects: Inserts or updates multiple rows in the students table.
   *
   * @param data - Array of student fields to upsert (batch, max 500).
   * @returns OkResult with the upserted Student records, or FailResult (INTERNAL_ERROR).
   */
  async upsertBatch(
    data: Array<{
      studentId: string;
      fullName: string;
      email: string | null;
      passwordHash?: string;
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
              passwordHash: d.passwordHash ?? "",
            }))
          )
          .onConflictDoUpdate({
            target: this.schema.students.studentId,
            set: {
              fullName: sql`excluded.full_name`,
              email: sql`excluded.email`,
              updatedAt: new Date(),
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
   * Side effects: Inserts or updates a row in the students table.
   *
   * @param data - Student fields to upsert.
   * @returns OkResult with the upserted Student record, or FailResult (INTERNAL_ERROR).
   */
  async upsert(data: {
    studentId: string;
    fullName: string;
    email?: string;
    passwordHash?: string;
  }): Promise<Result<Student>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.students)
          .values({
            studentId: data.studentId,
            fullName: data.fullName,
            email: data.email ?? null,
            passwordHash: data.passwordHash ?? "",
          })
          .onConflictDoUpdate({
            target: this.schema.students.studentId,
            set: {
              fullName: data.fullName,
              email: data.email ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
