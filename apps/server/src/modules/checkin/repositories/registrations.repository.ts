import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, gt, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

type RegistrationWithDetails = {
  registrationId: string;
  qrCode: string;
  workshopId: string;
  studentId: string;
  status: string;
  workshop: {
    workshopId: string;
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
  };
  student: {
    studentId: string;
    fullName: string;
  };
};

@Injectable()
export class RegistrationsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async findByQRCode(
    qrCode: string
  ): Promise<Result<RegistrationWithDetails | null>> {
    return tryCatch(
      async () => {
        const result = await this.db.query.registrations.findFirst({
          where: eq(this.schema.registrations.qrCode, qrCode),
          with: {
            workshop: true,
            student: true,
          },
        });
        if (!result) return null;

        return {
          registrationId: result.registrationId,
          qrCode: result.qrCode,
          workshopId: result.workshopId,
          studentId: result.studentId,
          status: result.status,
          workshop: {
            workshopId: result.workshop.workshopId,
            title: result.workshop.title,
            status: result.workshop.status,
            startsAt: result.workshop.startsAt,
            endsAt: result.workshop.endsAt,
          },
          student: {
            studentId: result.student.studentId,
            fullName: result.student.fullName,
          },
        };
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findActiveByWorkshopId(
    workshopId: string,
    options?: {
      cursor?: string;
      limit?: number;
    }
  ): Promise<
    Result<{
      data: RegistrationWithDetails[];
      total: number;
      nextCursor: string | null;
      hasMore: boolean;
    }>
  > {
    const limit = options?.limit ?? 200;

    return tryCatch(
      async () => {
        const activeStatuses = sql`ARRAY['PAID'::registration_status, 'CONFIRMED'::registration_status]`;

        const whereClause = and(
          eq(this.schema.registrations.workshopId, workshopId),
          sql`${this.schema.registrations.status} = ANY(${activeStatuses})`
        );

        const cursorClause = options?.cursor
          ? and(
              whereClause,
              gt(this.schema.registrations.registrationId, options.cursor)
            )
          : whereClause;

        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(this.schema.registrations)
          .where(
            sql`${this.schema.registrations.workshopId} = ${workshopId} AND ${this.schema.registrations.status} = ANY(${activeStatuses})`
          );

        const total = count;

        const results = await this.db.query.registrations.findMany({
          where: cursorClause,
          orderBy: desc(this.schema.registrations.registeredAt),
          limit: limit + 1,
          with: {
            workshop: true,
            student: true,
          },
        });

        const hasMore = results.length > limit;
        const items = hasMore ? results.slice(0, limit) : results;
        const nextCursor =
          hasMore && items.length > 0
            ? items[items.length - 1].registrationId
            : null;

        return {
          data: items.map((r) => ({
            registrationId: r.registrationId,
            qrCode: r.qrCode,
            workshopId: r.workshopId,
            studentId: r.studentId,
            status: r.status,
            workshop: {
              workshopId: r.workshop.workshopId,
              title: r.workshop.title,
              status: r.workshop.status,
              startsAt: r.workshop.startsAt,
              endsAt: r.workshop.endsAt,
            },
            student: {
              studentId: r.student.studentId,
              fullName: r.student.fullName,
            },
          })),
          total,
          nextCursor,
          hasMore,
        };
      },
      (err) => systemErrors.internal(err)
    );
  }
}
