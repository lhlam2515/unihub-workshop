/**
 * Retrieves and persists workshop records with optional joins to related entities.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, count, gte, lte, lt } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { WorkshopStatus } from "@/database/types/enums.types";
import type {
  Workshop,
  NewWorkshop,
  WorkshopUpdate,
  Speaker,
  Room,
} from "@/database/types/event-core.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class WorkshopsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Inserts a new workshop record into the database.
   *
   * Side effects:
   * - Executes INSERT on the workshops table.
   *
   * @param data - The workshop attributes to insert (title, speakerId, roomId, startsAt, endsAt, capacity, etc.).
   * @returns OkResult containing the newly created Workshop record, or FailResult (INTERNAL_ERROR).
   */
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

  /**
   * Retrieves a workshop by ID with left-joined speaker and room data.
   *
   * Drizzle operation: SELECT from workshops with LEFT JOIN on speakers (speakerId) and rooms (roomId).
   *
   * @param id - The UUID of the workshop to look up.
   * @returns OkResult containing { workshops, speakers, rooms }, or null if not found, or FailResult (INTERNAL_ERROR).
   */
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

  /**
   * Retrieves a workshop by ID filtered by its current workflow status.
   *
   * Useful for verifying a workshop is in a specific lifecycle state before performing
   * status-dependent operations. Combines workshopId and status in a single WHERE clause.
   *
   * @param id - The UUID of the workshop.
   * @param status - The expected workflow status value (e.g. "PUBLISHED", "DRAFT", "CANCELLED").
   * @returns OkResult containing the Workshop record, or null if not found or status does not match, or FailResult (INTERNAL_ERROR).
   */
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

  /**
   * Retrieves published workshops with optional date and payment filters, paginated.
   *
   * Business rules:
   * - Only returns workshops with status "PUBLISHED".
   * - Results are ordered by start date descending (soonest last).
   *
   * Drizzle operation: SELECT with LEFT JOIN on speakers and rooms, filtered by PUBLISHED status
   * and optional date range (gte/lte on startsAt) and isPaid equality. Paginated with LIMIT/OFFSET.
   *
   * @param filters.dateFrom - Optional lower bound for workshop start date.
   * @param filters.dateTo - Optional upper bound for workshop start date.
   * @param filters.isPaid - Optional filter for paid vs free workshops.
   * @param filters.page - The page number (1-based).
   * @param filters.limit - The number of items per page.
   * @returns OkResult containing { items: Workshop[] (with joined speaker/room), total: number }, or FailResult (INTERNAL_ERROR).
   */
  async findPublished(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    isPaid?: boolean;
    page: number;
    limit: number;
  }): Promise<Result<{ items: any[]; total: number }>> {
    return tryCatch(
      async () => {
        const conditions = [eq(this.schema.workshops.status, "PUBLISHED")];
        if (filters.dateFrom) {
          conditions.push(
            gte(this.schema.workshops.startsAt, filters.dateFrom)
          );
        }
        if (filters.dateTo) {
          conditions.push(lte(this.schema.workshops.startsAt, filters.dateTo));
        }
        if (filters.isPaid !== undefined) {
          conditions.push(eq(this.schema.workshops.isPaid, filters.isPaid));
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

  /**
   * Retrieves all workshops for admin management with optional status filter, paginated.
   *
   * Joins with workshop_slots (INNER JOIN), speakers (LEFT JOIN), and rooms (LEFT JOIN)
   * to provide a complete admin view. Results ordered by createdAt descending.
   *
   * Drizzle operation: SELECT with INNER JOIN on workshopSlots and LEFT JOIN on speakers and rooms.
   * Optional WHERE on status. Paginated with LIMIT/OFFSET.
   *
   * @param filters.status - Optional status to filter by (e.g. "DRAFT", "PUBLISHED", "CANCELLED").
   * @param filters.page - The page number (1-based).
   * @param filters.limit - The number of items per page.
   * @returns OkResult containing { items: Workshop[] (with joined slot, speaker, room), total: number }, or FailResult (INTERNAL_ERROR).
   */
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
          .innerJoin(
            this.schema.workshopSlots,
            eq(
              this.schema.workshops.workshopId,
              this.schema.workshopSlots.workshopId
            )
          )
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
   * Updates a workshop record with partial data.
   *
   * Side effects:
   * - Executes UPDATE on the workshops table for the given ID.
   *
   * @param id - The UUID of the workshop to update.
   * @param data - The partial workshop attributes to apply.
   * @returns OkResult containing the updated Workshop record, or FailResult (INTERNAL_ERROR).
   */
  async update(id: string, data: WorkshopUpdate): Promise<Result<Workshop>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshops)
          .set(data)
          .where(eq(this.schema.workshops.workshopId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates only the status column of a workshop (status transition).
   *
   * Side effects:
   * - Executes UPDATE workshops SET status WHERE workshopId = id.
   *
   * @param id - The UUID of the workshop.
   * @param status - The new status value (e.g. "PUBLISHED", "CANCELLED").
   * @returns OkResult containing the updated Workshop record, or FailResult (INTERNAL_ERROR).
   */
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

  /**
   * Transitions PUBLISHED workshops whose end time has passed to COMPLETED status.
   *
   * Business rules:
   * - Only PUBLISHED workshops with endsAt < now() are eligible.
   * - Transition is idempotent — workshops in DRAFT, CANCELLED, or already COMPLETED
   *   are excluded by the WHERE clause.
   *
   * Side effects:
   * - Executes UPDATE workshops SET status = 'COMPLETED' WHERE status = 'PUBLISHED' AND endsAt < now().
   *
   * @returns OkResult containing the count of workshops transitioned, or FailResult (INTERNAL_ERROR).
   */
  async completePastPublished(): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const now = new Date();
        const result = await this.db
          .update(this.schema.workshops)
          .set({ status: "COMPLETED" })
          .where(
            and(
              eq(this.schema.workshops.status, "PUBLISHED"),
              lt(this.schema.workshops.endsAt, now)
            )
          );
        return result.rowCount ?? 0;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
