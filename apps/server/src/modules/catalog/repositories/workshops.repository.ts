import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, count, gte, lte, lt, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { WorkshopStatus } from "@/infra/database/types/enums.types";
import type {
  Workshop,
  NewWorkshop,
  WorkshopUpdate,
  Speaker,
  Room,
} from "@/infra/database/types/event-core.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

export type PublishedBasic = { workshopId: string; seatsTotal: number };

@Injectable()
export class WorkshopsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  async create(data: NewWorkshop): Promise<Result<Workshop>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.workshops)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findById(id: string): Promise<
    Result<{
      workshops: Workshop;
      speakers: Speaker | null;
      rooms: Room | null;
    } | null>
  > {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.workshops)
          .leftJoin(
            this.schema.speakers,
            eq(this.schema.workshops.speakerId, this.schema.speakers.speakerId)
          )
          .leftJoin(
            this.schema.rooms,
            eq(this.schema.workshops.roomId, this.schema.rooms.roomId)
          )
          .where(eq(this.schema.workshops.workshopId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findByIdAndStatus(
    id: string,
    status: WorkshopStatus
  ): Promise<Result<Workshop | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.workshops)
          .where(
            and(
              eq(this.schema.workshops.workshopId, id),
              eq(this.schema.workshops.status, status)
            )
          )
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findPublished(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }): Promise<Result<{ items: any[]; total: number }>> {
    return tryCatch(
      async () => {
        const conditions = [eq(this.schema.workshops.status, "OPEN")];
        if (filters.dateFrom) {
          conditions.push(
            gte(this.schema.workshops.startsAt, filters.dateFrom)
          );
        }
        if (filters.dateTo) {
          conditions.push(lte(this.schema.workshops.startsAt, filters.dateTo));
        }

        const where = and(...conditions);
        const [totalResult] = await this.db
          .select({ count: count() })
          .from(this.schema.workshops)
          .where(where);

        const items = await this.db
          .select()
          .from(this.schema.workshops)
          .leftJoin(
            this.schema.speakers,
            eq(this.schema.workshops.speakerId, this.schema.speakers.speakerId)
          )
          .leftJoin(
            this.schema.rooms,
            eq(this.schema.workshops.roomId, this.schema.rooms.roomId)
          )
          .where(where)
          .orderBy(desc(this.schema.workshops.startsAt))
          .limit(filters.limit)
          .offset((filters.page - 1) * filters.limit);

        return { items, total: Number(totalResult.count) };
      },
      (err) => systemErrors.internal(err)
    );
  }

  async listAdmin(filters: {
    status?: WorkshopStatus;
    page: number;
    limit: number;
  }): Promise<Result<{ items: any[]; total: number }>> {
    return tryCatch(
      async () => {
        const conditions: ReturnType<typeof eq>[] = [];
        if (filters.status) {
          conditions.push(eq(this.schema.workshops.status, filters.status));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await this.db
          .select({ count: count() })
          .from(this.schema.workshops)
          .where(where);

        const items = await this.db
          .select()
          .from(this.schema.workshops)
          .leftJoin(
            this.schema.speakers,
            eq(this.schema.workshops.speakerId, this.schema.speakers.speakerId)
          )
          .leftJoin(
            this.schema.rooms,
            eq(this.schema.workshops.roomId, this.schema.rooms.roomId)
          )
          .where(where)
          .orderBy(desc(this.schema.workshops.createdAt))
          .limit(filters.limit)
          .offset((filters.page - 1) * filters.limit);

        return { items, total: Number(totalResult.count) };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a workshop record with partial data using optimistic locking.
   *
   * Only applies the update if the current version matches expectedVersion.
   * Atomically increments the version on success.
   *
   * Side effects:
   * - Executes UPDATE on the workshops table for the given ID with version check.
   *
   * @param id - The UUID of the workshop to update.
   * @param data - The partial workshop attributes to apply.
   * @param expectedVersion - The version expected by the caller (from If-Match header).
   * @returns OkResult containing the updated Workshop record, or null if version mismatch, or FailResult (INTERNAL_ERROR).
   */
  async update(
    id: string,
    data: WorkshopUpdate,
    expectedVersion: number
  ): Promise<Result<Workshop | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshops)
          .set({
            ...data,
            version: sql`${this.schema.workshops.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.schema.workshops.workshopId, id),
              eq(this.schema.workshops.version, expectedVersion)
            )
          )
          .returning();
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async updateStatus(
    id: string,
    status: WorkshopStatus
  ): Promise<Result<Workshop>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshops)
          .set({ status })
          .where(eq(this.schema.workshops.workshopId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async completePastOpen(): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const now = new Date();
        const result = await this.db
          .update(this.schema.workshops)
          .set({ status: "COMPLETED" })
          .where(
            and(
              eq(this.schema.workshops.status, "OPEN"),
              lt(this.schema.workshops.endsAt, now)
            )
          );
        return result.rowCount ?? 0;
      },
      (err) => systemErrors.internal(err)
    );
  }

  async findOpenBasic(): Promise<Result<PublishedBasic[]>> {
    return tryCatch(
      async () => {
        return this.db
          .select({
            workshopId: this.schema.workshops.workshopId,
            seatsTotal: this.schema.workshops.seatsTotal,
          })
          .from(this.schema.workshops)
          .where(eq(this.schema.workshops.status, "OPEN"));
      },
      (err) => systemErrors.internal(err)
    );
  }
}
