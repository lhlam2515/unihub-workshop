import crypto from "node:crypto";

import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { CheckinRecord } from "@/database/types/transaction.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

type CheckinRecordWithStudent = CheckinRecord & {
  student: { studentId: string; fullName: string; studentCode: string };
};

@Injectable()
export class CheckinRecordsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Inserts a check-in record, silently ignoring duplicates via ON CONFLICT DO NOTHING.
   *
   * Database: INSERT INTO checkin_records ON CONFLICT (ticket_id, workshop_id) DO NOTHING.
   * Returns null when a duplicate is detected (ticket already checked in for this workshop).
   *
   * Side effects:
   * - Writes a new row to `checkin_records` when no duplicate exists.
   *
   * @param data - Check-in record payload including ticket, student, workshop, source, and timestamps.
   * @returns OkResult with the inserted record, or null on duplicate, or FailResult (INTERNAL_ERROR).
   */
  async create(data: {
    registrationId: string;
    ticketId: string;
    studentId: string;
    workshopId: string;
    checkedInAt: Date;
    checkedInBy: string;
    source: "ONLINE" | "OFFLINE_SYNC";
    deviceId?: string;
    syncedAt?: Date;
  }): Promise<Result<CheckinRecord | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.checkinRecords)
          .values({ ...data, checkinId: crypto.randomUUID() })
          .onConflictDoNothing()
          .returning();
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves recent check-in records for a workshop, ordered by check-in time descending.
   *
   * Database: Queries `checkin_records` filtered by workshopId, with student relation,
   * limited to the most recent N records.
   *
   * @param workshopId - UUID of the workshop to query.
   * @param limit - Maximum number of records to return (defaults to 20).
   * @returns OkResult with check-in records including student details, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopId(
    workshopId: string,
    limit = 20
  ): Promise<Result<CheckinRecordWithStudent[]>> {
    return tryCatch(
      async () => {
        const results = await this.db.query.checkinRecords.findMany({
          where: eq(this.schema.checkinRecords.workshopId, workshopId),
          orderBy: desc(this.schema.checkinRecords.checkedInAt),
          limit,
          with: { student: true },
        });
        return results;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Counts total check-in records for a workshop.
   *
   * Database: SELECT count(*)::int FROM checkin_records WHERE workshop_id = workshopId.
   *
   * @param workshopId - UUID of the workshop.
   * @returns OkResult with the count, or FailResult (INTERNAL_ERROR).
   */
  async countByWorkshopId(workshopId: string): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(this.schema.checkinRecords)
          .where(eq(this.schema.checkinRecords.workshopId, workshopId));
        return count;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Counts confirmed registrations for a workshop to derive expected attendance.
   *
   * Database: SELECT count(*)::int FROM registrations WHERE workshop_id = workshopId.
   * Used alongside countByWorkshopId to compute pending_count in check-in status.
   *
   * @param workshopId - UUID of the workshop.
   * @returns OkResult with the confirmed registration count, or FailResult (INTERNAL_ERROR).
   */
  async countConfirmedRegistrationsByWorkshopId(
    workshopId: string
  ): Promise<Result<number>> {
    return tryCatch(
      async () => {
        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(this.schema.registrations)
          .where(
            and(
              eq(this.schema.registrations.workshopId, workshopId),
              eq(this.schema.registrations.status, "CONFIRMED")
            )
          );
        return count;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
