/**
 * Retrieves and persists room records and checks for scheduling conflicts.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, lte, gte, ne } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type {
  Room,
  NewRoom,
  Workshop,
} from "@/database/types/event-core.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class RoomsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves all rooms ordered by creation date descending.
   *
   * Drizzle operation: SELECT from rooms with ORDER BY createdAt DESC.
   *
   * @returns OkResult containing an array of all Room records, or FailResult (INTERNAL_ERROR).
   */
  async findAll(): Promise<Result<Room[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.rooms)
          .orderBy(desc(this.schema.rooms.createdAt)),
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves a single room by its unique identifier.
   *
   * Drizzle operation: SELECT from rooms filtered by roomId. Limit 1.
   *
   * @param id - The UUID of the room to look up.
   * @returns OkResult containing the Room record (with name, capacity, building, facilities), or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findById(id: string): Promise<Result<Room | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.rooms)
          .where(eq(this.schema.rooms.roomId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Inserts a new room record into the database.
   *
   * Side effects:
   * - Executes INSERT on the rooms table.
   *
   * @param data - The room attributes to insert (name, building?, floor?, capacity, facilities?).
   * @returns OkResult containing the newly created Room record, or FailResult (INTERNAL_ERROR).
   */
  async create(data: NewRoom): Promise<Result<Room>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.rooms)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds PUBLISHED workshops in a room whose time ranges overlap with the given interval.
   *
   * Overlap detection uses the standard condition:
   * existing.starts_at < proposed.endsAt AND existing.ends_at > proposed.startsAt.
   * Only PUBLISHED workshops are considered as conflicts.
   *
   * Drizzle operation: SELECT from workshops with compound WHERE on roomId, status='PUBLISHED',
   * startsAt <= endsAt, endsAt >= startsAt. Optionally excludes a specific workshopId.
   *
   * @param roomId - The UUID of the room to check.
   * @param startsAt - The proposed start time of the new/updated workshop.
   * @param endsAt - The proposed end time of the new/updated workshop.
   * @param excludeWorkshopId - Optional UUID of a workshop to exclude (self-exclusion during updates).
   * @returns OkResult containing an array of conflicting Workshop records, or FailResult (INTERNAL_ERROR).
   */
  async findConflicting(
    roomId: string,
    startsAt: Date,
    endsAt: Date,
    excludeWorkshopId?: string
  ): Promise<Result<Workshop[]>> {
    return tryCatch(
      async () => {
        const conditions = [
          eq(this.schema.workshops.roomId, roomId),
          eq(this.schema.workshops.status, "PUBLISHED"),
          lte(this.schema.workshops.startsAt, endsAt),
          gte(this.schema.workshops.endsAt, startsAt),
        ];
        if (excludeWorkshopId) {
          conditions.push(
            ne(this.schema.workshops.workshopId, excludeWorkshopId)
          );
        }
        return this.db
          .select()
          .from(this.schema.workshops)
          .where(and(...conditions));
      },
      (err) => systemErrors.internal(err)
    );
  }
}
