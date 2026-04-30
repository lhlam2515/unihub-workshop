import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { CheckinStaffAssignment } from "@/database/types/identity.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

@Injectable()
export class CheckinStaffAssignmentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Looks up a check-in staff member's workshop assignment by user ID.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   * @returns The assignment record (containing workshop_ids array) or null.
   */
  async findByUserId(
    userId: string
  ): Promise<Result<CheckinStaffAssignment | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.checkinStaffAssignments)
          .where(eq(this.schema.checkinStaffAssignments.userId, userId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates or replaces a check-in staff member's workshop assignment.
   *
   * Business rules:
   * - Uses ON CONFLICT DO UPDATE on the unique user_id constraint.
   * - Replaces the entire workshop_ids array (not a merge operation).
   *
   * Side effects: Inserts or updates a row in checkin_staff_assignments.
   *
   * @param userId - The CHECKIN_STAFF user's UUID.
   * @param workshopIds - Array of workshop UUIDs to assign (replaces existing).
   * @returns The created or updated assignment record.
   */
  async upsert(
    userId: string,
    workshopIds: string[]
  ): Promise<Result<CheckinStaffAssignment>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.checkinStaffAssignments)
          .values({ userId, workshopIds })
          .onConflictDoUpdate({
            target: this.schema.checkinStaffAssignments.userId,
            set: { workshopIds, updatedAt: new Date() },
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
