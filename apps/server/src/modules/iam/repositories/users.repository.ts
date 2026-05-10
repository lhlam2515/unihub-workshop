import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, sql, type SQLWrapper } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { NewUser, User } from "@/infra/database/types/identity.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Looks up a user by their system ID.
   *
   * @param id - The user's UUID.
   * @returns The user entity or null if not found.
   */
  async findById(id: string): Promise<Result<User | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.users)
          .where(eq(this.schema.users.userId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Looks up a user by their email address (uses idx_users_email index).
   *
   * Used in the login flow to find the user before bcrypt verification.
   *
   * @param email - The user's email address.
   * @returns The user entity or null if not found.
   */
  async findByEmail(email: string): Promise<Result<User | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.users)
          .where(eq(this.schema.users.email, email))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Inserts a new user record.
   *
   * @param data - The user data excluding system-generated fields (userId, createdAt, updatedAt).
   * @returns The newly created user entity.
   */
  async create(data: NewUser): Promise<Result<User>> {
    return tryCatch(
      async () => {
        const [inserted] = await this.db
          .insert(this.schema.users)
          .values(data)
          .returning();
        return inserted;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Returns a paginated, optionally filtered list of users.
   *
   * Executes the data query and count query concurrently via Promise.all.
   * Results are ordered by created_at descending (newest first).
   *
   * @param role - Optional role filter (STUDENT | BTC | CHECKIN_STAFF).
   * @param page - Page index (1-based, default 1).
   * @param limit - Items per page (default 20).
   * @returns Object containing items array and total count.
   */
  async list(
    role?: string,
    q?: string,
    page = 1,
    limit = 20
  ): Promise<Result<{ items: User[]; total: number }>> {
    return tryCatch(
      async () => {
        const conditions: SQLWrapper[] = [];
        if (role) {
          conditions.push(sql`${this.schema.users.role} = ${role}`);
        }
        if (q) {
          conditions.push(
            sql`${this.schema.users.email} ILIKE ${"%" + q + "%"}`
          );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, [totalResult]] = await Promise.all([
          this.db
            .select()
            .from(this.schema.users)
            .where(where)
            .orderBy(desc(this.schema.users.createdAt))
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(this.schema.users)
            .where(where),
        ]);

        return { items: rows, total: totalResult?.count ?? 0 };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a user's account status.
   *
   * @param id - The target user's UUID.
   * @param status - New status value.
   * @returns The updated user entity.
   */
  async updateStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION"
  ): Promise<Result<User>> {
    return tryCatch(
      async () => {
        const [updated] = await this.db
          .update(this.schema.users)
          .set({ status, updatedAt: new Date() })
          .where(eq(this.schema.users.userId, id))
          .returning();
        return updated;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
