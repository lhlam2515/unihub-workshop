import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { CheckinStaffAssignment } from "@/infra/database/types/identity.types";
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
   * Looks up a check-in staff member's workshop assignment by staff ID.
   *
   * @param staffId - The CHECKIN_STAFF staff UUID.
   * @returns The assignment record (containing workshop_ids array) or null.
   */
  async findByStaffId(
    staffId: string
  ): Promise<Result<CheckinStaffAssignment | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.checkinStaffAssignments)
          .where(eq(this.schema.checkinStaffAssignments.staffId, staffId))
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
   * - Uses ON CONFLICT DO UPDATE on the unique staff_id constraint.
   * - Replaces the entire workshop_ids array (not a merge operation).
   *
   * Side effects: Inserts or updates a row in checkin_staff_assignments.
   *
   * @param staffId - The CHECKIN_STAFF staff UUID.
   * @param workshopIds - Array of workshop UUIDs to assign (replaces existing).
   * @returns The created or updated assignment record.
   */
  async upsert(
    staffId: string,
    workshopIds: string[]
  ): Promise<Result<CheckinStaffAssignment>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.checkinStaffAssignments)
          .values({ staffId, workshopIds })
          .onConflictDoUpdate({
            target: this.schema.checkinStaffAssignments.staffId,
            set: { workshopIds, updatedAt: new Date() },
          })
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
