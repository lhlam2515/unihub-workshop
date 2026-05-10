/**
 * Retrieves and persists speaker records from the database.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type {
  Speaker,
  NewSpeaker,
} from "@/infra/database/types/event-core.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class SpeakersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves all speakers ordered by creation date descending.
   *
   * Drizzle operation: SELECT from speakers with ORDER BY createdAt DESC.
   *
   * @returns OkResult containing an array of all Speaker records, or FailResult (INTERNAL_ERROR).
   */
  async findAll(q?: string): Promise<Result<Speaker[]>> {
    return tryCatch(
      async () => {
        if (!q) {
          return this.db
            .select()
            .from(this.schema.speakers)
            .orderBy(desc(this.schema.speakers.createdAt));
        }
        return this.db
          .select()
          .from(this.schema.speakers)
          .where(
            and(sql`${this.schema.speakers.fullName} ILIKE ${"%" + q + "%"}`)
          )
          .orderBy(desc(this.schema.speakers.createdAt));
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves a single speaker by its unique identifier.
   *
   * Drizzle operation: SELECT from speakers filtered by speakerId. Limit 1.
   *
   * @param id - The UUID of the speaker to look up.
   * @returns OkResult containing the Speaker record (with fullName, title, bio, avatarUrl), or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findById(id: string): Promise<Result<Speaker | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.speakers)
          .where(eq(this.schema.speakers.speakerId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Inserts a new speaker record into the database.
   *
   * Side effects:
   * - Executes INSERT on the speakers table.
   *
   * @param data - The speaker attributes to insert (fullName, title?, bio?, avatarUrl?).
   * @returns OkResult containing the newly created Speaker record, or FailResult (INTERNAL_ERROR).
   */
  async create(data: NewSpeaker): Promise<Result<Speaker>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.speakers)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a speaker record with partial data.
   *
   * Side effects:
   * - Executes UPDATE on the speakers table for the given ID.
   *
   * @param id - The UUID of the speaker to update.
   * @param data - The partial speaker attributes to apply.
   * @returns OkResult containing the updated Speaker record, or FailResult (INTERNAL_ERROR).
   */
  /**
   * Deletes a speaker record by ID.
   *
   * Side effects:
   * - Executes DELETE on the speakers table for the given ID.
   *
   * @param id - The UUID of the speaker to delete.
   * @returns OkResult<void>, or FailResult (INTERNAL_ERROR).
   */
  async delete(id: string): Promise<Result<void>> {
    return tryCatch(
      async () => {
        await this.db
          .delete(this.schema.speakers)
          .where(eq(this.schema.speakers.speakerId, id));
      },
      (err) => systemErrors.internal(err)
    );
  }

  async update(
    id: string,
    data: Partial<NewSpeaker>
  ): Promise<Result<Speaker>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.speakers)
          .set(data)
          .where(eq(this.schema.speakers.speakerId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
