import { Injectable, Inject } from "@nestjs/common";
import { eq, and, sql, desc, type SQLWrapper } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { Staff, NewStaff } from "@/infra/database/types/identity.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

@Injectable()
export class StaffRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async findByEmail(email: string): Promise<Result<Staff | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.staff)
          .where(eq(this.schema.staff.email, email))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findById(staffId: string): Promise<Result<Staff | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.staff)
          .where(eq(this.schema.staff.staffId, staffId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async create(data: NewStaff): Promise<Result<Staff>> {
    return tryCatch(
      async () => {
        const [inserted] = await this.db
          .insert(this.schema.staff)
          .values(data)
          .returning();
        return inserted;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async list(
    role?: string,
    q?: string,
    page = 1,
    limit = 20
  ): Promise<Result<{ items: Staff[]; total: number }>> {
    return tryCatch(
      async () => {
        const conditions: SQLWrapper[] = [];
        if (role) {
          conditions.push(sql`${this.schema.staff.role} = ${role}`);
        }
        if (q) {
          conditions.push(
            sql`${this.schema.staff.email} ILIKE ${"%" + q + "%"}`
          );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, [totalResult]] = await Promise.all([
          this.db
            .select()
            .from(this.schema.staff)
            .where(where)
            .orderBy(desc(this.schema.staff.createdAt))
            .limit(limit)
            .offset((page - 1) * limit),
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(this.schema.staff)
            .where(where),
        ]);

        return { items: rows, total: totalResult?.count ?? 0 };
      },
      (err) => systemErrors.internal(err)
    );
  }

  async updateStatus(
    staffId: string,
    isActive: boolean
  ): Promise<Result<Staff>> {
    return tryCatch(
      async () => {
        const [updated] = await this.db
          .update(this.schema.staff)
          .set({ isActive })
          .where(eq(this.schema.staff.staffId, staffId))
          .returning();
        return updated;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
