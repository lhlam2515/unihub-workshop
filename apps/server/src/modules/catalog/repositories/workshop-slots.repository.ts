/**
 * Retrieves and persists workshop slot records and manages atomic seat counters.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { WorkshopSlot } from "@/database/types/event-core.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class WorkshopSlotsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves the slot record for a given workshop.
   *
   * Drizzle operation: SELECT from workshop_slots filtered by workshopId. Limit 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the WorkshopSlot record (with confirmedCount, lockedCount), or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopId(
    workshopId: string
  ): Promise<Result<WorkshopSlot | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.workshopSlots)
          .where(eq(this.schema.workshopSlots.workshopId, workshopId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new workshop slot record with initialised counters.
   *
   * Initialises lockedCount=0 and confirmedCount=0 for the new slot.
   *
   * Side effects:
   * - Inserts a new row into the workshop_slots table.
   *
   * @param workshopId - The UUID of the workshop to create a slot for.
   * @param capacity - The total seating capacity for this workshop (stored as totalCapacity).
   * @returns OkResult containing the newly created WorkshopSlot record, or FailResult (INTERNAL_ERROR).
   */
  async create(
    workshopId: string,
    capacity: number
  ): Promise<Result<WorkshopSlot>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.workshopSlots)
          .values({
            workshopId,
            totalCapacity: capacity,
            lockedCount: 0,
            confirmedCount: 0,
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Atomically increments the confirmed attendee count for a workshop slot.
   *
   * Drizzle operation: UPDATE workshop_slots SET confirmedCount = confirmedCount + 1 WHERE workshopId.
   * Uses raw SQL expression for atomic increment (not read-then-write).
   *
   * Side effects:
   * - Increments the confirmed_count column in workshop_slots by 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the updated WorkshopSlot record, or FailResult (INTERNAL_ERROR).
   */
  async incrementConfirmed(workshopId: string): Promise<Result<WorkshopSlot>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshopSlots)
          .set({
            confirmedCount: sql`${this.schema.workshopSlots.confirmedCount} + 1`,
          })
          .where(eq(this.schema.workshopSlots.workshopId, workshopId))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Atomically decrements the confirmed attendee count for a workshop slot.
   *
   * Drizzle operation: UPDATE workshop_slots SET confirmedCount = confirmedCount - 1 WHERE workshopId.
   * Uses raw SQL expression for atomic decrement (not read-then-write).
   *
   * Side effects:
   * - Decrements the confirmed_count column in workshop_slots by 1.
   *
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult containing the updated WorkshopSlot record, or FailResult (INTERNAL_ERROR).
   */
  async decrementConfirmed(workshopId: string): Promise<Result<WorkshopSlot>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshopSlots)
          .set({
            confirmedCount: sql`${this.schema.workshopSlots.confirmedCount} - 1`,
          })
          .where(eq(this.schema.workshopSlots.workshopId, workshopId))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Reconciles the locked and confirmed counters for a workshop slot to known values.
   *
   * Overwrites both counters with externally computed values. Used by the background
   * reconciliation job to correct drift between Redis seat counters and the database.
   *
   * Drizzle operation: UPDATE workshop_slots SET lockedCount, confirmedCount WHERE workshopId.
   *
   * Side effects:
   * - Overwrites locked_count and confirmed_count columns with the provided values.
   *
   * @param workshopId - The UUID of the workshop.
   * @param lockedCount - The corrected locked seat count.
   * @param confirmedCount - The corrected confirmed seat count.
   * @returns OkResult containing the updated WorkshopSlot record, or FailResult (INTERNAL_ERROR).
   */
  async reconcile(
    workshopId: string,
    lockedCount: number,
    confirmedCount: number
  ): Promise<Result<WorkshopSlot>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.workshopSlots)
          .set({ lockedCount, confirmedCount })
          .where(eq(this.schema.workshopSlots.workshopId, workshopId))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
