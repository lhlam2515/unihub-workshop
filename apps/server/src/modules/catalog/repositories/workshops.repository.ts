import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, gte, lte, lt, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { DrizzleTransaction } from "@/infra/database/types/drizzle.types";
import type { WorkshopStatus } from "@/infra/database/types/enums.types";
import type {
  Workshop,
  NewWorkshop,
  WorkshopUpdate,
  Speaker,
  Room,
} from "@/infra/database/types/event-core.types";
import {
  decodeCursor,
  encodeCursor,
  type CursorPaginationInput,
  type CursorPaginationResult,
} from "@/shared/pagination/cursor-pagination.helper";
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

  async findPublished(
    filters: { dateFrom?: Date; dateTo?: Date } & CursorPaginationInput
  ): Promise<Result<CursorPaginationResult<any>>> {
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

        // Cursor-based pagination: decode cursor and filter by startsAt
        if (filters.cursor) {
          const cursorDate = new Date(decodeCursor(filters.cursor));
          conditions.push(lt(this.schema.workshops.startsAt, cursorDate));
        }

        const where = and(...conditions);
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
          .limit(filters.limit + 1); // fetch one extra to detect hasMore

        const hasMore = items.length > filters.limit;
        if (hasMore) items.pop();

        const nextCursor =
          items.length > 0
            ? encodeCursor(items[items.length - 1].workshops.startsAt)
            : null;

        return { items, nextCursor, hasMore };
      },
      (err) => systemErrors.internal(err)
    );
  }

  async listAdmin(
    filters: { status?: WorkshopStatus } & CursorPaginationInput
  ): Promise<Result<CursorPaginationResult<any>>> {
    return tryCatch(
      async () => {
        const conditions: ReturnType<typeof eq>[] = [];
        if (filters.status) {
          conditions.push(eq(this.schema.workshops.status, filters.status));
        }

        // Cursor-based pagination: decode cursor and filter by createdAt
        if (filters.cursor) {
          const cursorDate = new Date(decodeCursor(filters.cursor));
          conditions.push(lt(this.schema.workshops.createdAt, cursorDate));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

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
          .limit(filters.limit + 1); // fetch one extra to detect hasMore

        const hasMore = items.length > filters.limit;
        if (hasMore) items.pop();

        const nextCursor =
          items.length > 0
            ? encodeCursor(items[items.length - 1].workshops.createdAt)
            : null;

        return { items, nextCursor, hasMore };
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

  /**
   * Atomically decrements seats_available with optimistic locking.
   *
   * Only applies the update if the current version matches expectedVersion
   * AND seats_available > 0. Used as the enforcement layer (ADR-03) during
   * registration — PostgreSQL is the sole source of truth for seat counts.
   *
   * Business rules:
   * - Version must match expectedVersion (optimistic lock).
   * - seats_available must be > 0 (prevents overselling at DB level).
   * - Returns rowsAffected: 0 means version conflict OR sold out.
   *
   * Side effects:
   * - UPDATE workshops SET seats_available = seats_available - 1, version = version + 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @param expectedVersion - The version read before the update attempt.
   * @param tx - Optional transaction handle for multi-statement atomicity.
   * @returns OkResult with { rowsAffected, newVersion }, or FailResult (INTERNAL_ERROR).
   */
  async decrementSeat(
    workshopId: string,
    expectedVersion: number,
    tx?: DrizzleTransaction
  ): Promise<Result<{ rowsAffected: number; newVersion: number }>> {
    const conn = tx ?? this.db;
    return tryCatch(
      async () => {
        const result = await conn
          .update(this.schema.workshops)
          .set({
            seatsAvailable: sql`${this.schema.workshops.seatsAvailable} - 1`,
            version: sql`${this.schema.workshops.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.schema.workshops.workshopId, workshopId),
              eq(this.schema.workshops.version, expectedVersion),
              sql`${this.schema.workshops.seatsAvailable} > 0`
            )
          );
        return {
          rowsAffected: result.rowCount ?? 0,
          newVersion: expectedVersion + 1,
        };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Increments seats_available for seat release (cancel, timeout, payment failure).
   *
   * No optimistic locking — seat release has no contention (adding seats back).
   * Still increments version for audit trail consistency.
   *
   * Side effects:
   * - UPDATE workshops SET seats_available = seats_available + 1, version = version + 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @param tx - Optional transaction handle.
   * @returns OkResult(void), or FailResult (INTERNAL_ERROR).
   */
  async incrementSeat(
    workshopId: string,
    tx?: DrizzleTransaction
  ): Promise<Result<void>> {
    const conn = tx ?? this.db;
    return tryCatch(
      async () => {
        await conn
          .update(this.schema.workshops)
          .set({
            seatsAvailable: sql`${this.schema.workshops.seatsAvailable} + 1`,
            version: sql`${this.schema.workshops.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(this.schema.workshops.workshopId, workshopId));
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Reads the current version and seats_available for optimistic locking pre-read.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with { version, seatsAvailable }, or null if not found.
   */
  async getSeatVersion(
    workshopId: string
  ): Promise<Result<{ version: number; seatsAvailable: number } | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select({
            version: this.schema.workshops.version,
            seatsAvailable: this.schema.workshops.seatsAvailable,
          })
          .from(this.schema.workshops)
          .where(eq(this.schema.workshops.workshopId, workshopId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
