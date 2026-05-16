import { Injectable, Inject } from "@nestjs/common";
import { eq, and, desc, or, sql, inArray, lt, gte, isNotNull, isNull } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { DrizzleTransaction } from "@/infra/database/types/drizzle.types";
import type {
  Registration,
  NewRegistration,
} from "@/infra/database/types/transaction.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

export interface RegistrationWithWorkshopTitle extends Registration {
  workshopTitle: string;
  workshopStartsAt: Date | null;
  workshopEndsAt: Date | null;
  workshopSeatsTotal: number | null;
  workshopSeatsAvailable: number | null;
  workshopPrice: number | null;
  workshopStatus: string | null;
  speakerId: string | null;
  speakerFullName: string | null;
  speakerTitle: string | null;
  speakerAvatarUrl: string | null;
  roomId: string | null;
  roomName: string | null;
  roomBuilding: string | null;
  roomFloor: number | null;
  roomFloorPlanUrl: string | null;
}

export interface CancelResult {
  cancelledCount: number;
  affectedStudentIds: string[];
}

@Injectable()
export class RegistrationsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Executes a callback within a Drizzle database transaction.
   *
   * All repository methods accept an optional tx parameter — pass the tx
   * from this callback to participate in the same ACID transaction.
   * Used by OL seat decrement + registration INSERT atomicity (ADR-03).
   *
   * Side effects:
   * - Opens a database transaction; commits on success, rolls back on thrown error.
   *
   * @param callback - Async function receiving the transaction client.
   * @returns The value returned by the callback.
   */
  async transaction<T>(
    callback: (tx: DrizzleTransaction) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback);
  }

  /**
   * Finds a single registration by its primary key.
   *
   * @param id - The registration UUID.
   * @returns OkResult with the Registration entity, or null if not found.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findById(id: string): Promise<Result<Registration | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.registrations)
          .where(eq(this.schema.registrations.registrationId, id))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds an active (non-cancelled) registration for a student in a workshop.
   *
   * Excludes registrations with CANCELLED status via raw SQL comparison to
   * allow re-registration after cancellation without hitting a unique constraint.
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param workshopId - The UUID of the workshop.
   * @returns OkResult with the Registration entity, or null if no active registration exists.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findByStudentAndWorkshop(
    studentId: string,
    workshopId: string
  ): Promise<Result<Registration | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.registrations)
          .where(
            and(
              eq(this.schema.registrations.studentId, studentId),
              eq(this.schema.registrations.workshopId, workshopId),
              sql`${this.schema.registrations.status} <> 'CANCELLED'`
            )
          )
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new registration record.
   *
   * Side effects:
   * - Inserts a row into the registrations table.
   *
   * @param data - NewRegistration payload with studentId, workshopId, and initial status.
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with the created Registration entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async create(
    data: NewRegistration,
    _tx?: DrizzleTransaction
  ): Promise<Result<Registration>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.registrations)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a registration's status and sets the corresponding timestamp.
   *
   * Automatically sets confirmedAt for CONFIRMED status and cancelledAt for
   * CANCELLED status. Always updates updatedAt to the current time.
   *
   * Side effects:
   * - Updates a row in the registrations table.
   *
   * @param id - The registration UUID.
   * @param status - New status value (CONFIRMED, CANCELLED, etc.).
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with the updated Registration entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async updateStatus(
    id: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<Result<Registration>> {
    const conn = tx ?? this.db;
    return tryCatch(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
          updatedAt: new Date(),
        };

        if (status === "CONFIRMED") {
          updateData.confirmedAt = new Date();
        } else if (status === "CANCELLED") {
          updateData.cancelledAt = new Date();
        }

        const [result] = await conn
          .update(this.schema.registrations)
          .set(updateData)
          .where(eq(this.schema.registrations.registrationId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a registration's status with optimistic locking version check.
   *
   * Only applies the update if the current version matches expectedVersion.
   * Atomically increments the version on success.
   * Automatically sets confirmedAt for CONFIRMED status and cancelledAt for
   * CANCELLED status.
   *
   * Side effects:
   * - Updates a row in the registrations table with version check.
   *
   * @param id - The registration UUID.
   * @param status - New status value (CONFIRMED, CANCELLED, etc.).
   * @param expectedVersion - The version expected by the caller.
   * @param tx - Optional transaction handle for multi-statement operations.
   * @returns OkResult with the updated Registration entity, or null if version mismatch.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async updateWithVersion(
    id: string,
    status: string,
    expectedVersion: number,
    tx?: DrizzleTransaction
  ): Promise<Result<Registration | null>> {
    const conn = tx ?? this.db;
    return tryCatch(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
          version: sql`${this.schema.registrations.version} + 1`,
          updatedAt: new Date(),
        };

        if (status === "CONFIRMED") {
          updateData.confirmedAt = new Date();
        } else if (status === "CANCELLED") {
          updateData.cancelledAt = new Date();
        }

        const [result] = await conn
          .update(this.schema.registrations)
          .set(updateData)
          .where(
            and(
              eq(this.schema.registrations.registrationId, id),
              eq(this.schema.registrations.version, expectedVersion)
            )
          )
          .returning();
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Lists registrations belonging to a student, with workshop titles.
   *
   * Performs a LEFT JOIN with the workshops table to include the workshop
   * title. Supports optional status filtering and offset-based pagination.
   * Results are ordered by registration date descending.
   *
   * @param studentId - The UUID of the student (IDOR-enforced — never from request body).
   * @param statusFilter - Optional status to filter by (e.g., CONFIRMED, PENDING_PAYMENT).
   * @param pagination - Optional pagination with page (default 1) and limit (default 20).
   * @returns OkResult with { items: RegistrationWithWorkshopTitle[], total: number }.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findMyRegistrations(
    studentId: string,
    filters?: {
      status?: string[];
      upcoming?: boolean;
      cursor?: string;
      limit?: number;
    }
  ): Promise<
    Result<{
      items: RegistrationWithWorkshopTitle[];
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    return tryCatch(
      async () => {
        const limit = filters?.limit ?? 20;
        const conditions = [eq(this.schema.registrations.studentId, studentId)];

        if (filters?.status && filters.status.length > 0) {
          conditions.push(
            inArray(this.schema.registrations.status, filters.status as any[])
          );
        }

        if (filters?.upcoming) {
          conditions.push(gte(this.schema.workshops.startsAt, new Date()));
        }

        if (filters?.cursor) {
          const cursorDate = new Date(
            Buffer.from(filters.cursor, "base64").toString("ascii")
          );
          conditions.push(
            lt(this.schema.registrations.registeredAt, cursorDate)
          );
        }

        const rows = await this.db
          .select({
            registration: this.schema.registrations,
            workshopId: this.schema.workshops.workshopId,
            workshopTitle: this.schema.workshops.title,
            workshopStartsAt: this.schema.workshops.startsAt,
            workshopEndsAt: this.schema.workshops.endsAt,
            workshopSeatsTotal: this.schema.workshops.seatsTotal,
            workshopSeatsAvailable: this.schema.workshops.seatsAvailable,
            workshopPrice: this.schema.workshops.price,
            workshopStatus: this.schema.workshops.status,
            speakerId: this.schema.speakers.speakerId,
            speakerFullName: this.schema.speakers.fullName,
            speakerTitle: this.schema.speakers.title,
            speakerAvatarUrl: this.schema.speakers.avatarUrl,
            roomId: this.schema.rooms.roomId,
            roomName: this.schema.rooms.name,
            roomBuilding: this.schema.rooms.building,
            roomFloor: this.schema.rooms.floor,
            roomFloorPlanUrl: this.schema.rooms.floorPlanUrl,
          })
          .from(this.schema.registrations)
          .leftJoin(
            this.schema.workshops,
            eq(
              this.schema.registrations.workshopId,
              this.schema.workshops.workshopId
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
          .where(and(...conditions))
          .orderBy(desc(this.schema.registrations.registeredAt))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        if (hasMore) rows.pop();

        const items: RegistrationWithWorkshopTitle[] = rows.map((row) => ({
          ...row.registration,
          workshopTitle: row.workshopTitle ?? "",
          workshopStartsAt: row.workshopStartsAt,
          workshopEndsAt: row.workshopEndsAt,
          workshopSeatsTotal: row.workshopSeatsTotal ?? null,
          workshopSeatsAvailable: row.workshopSeatsAvailable ?? null,
          workshopPrice: row.workshopPrice ? Number(row.workshopPrice) : null,
          workshopStatus: row.workshopStatus ?? null,
          speakerId: row.speakerId ?? null,
          speakerFullName: row.speakerFullName ?? null,
          speakerTitle: row.speakerTitle ?? null,
          speakerAvatarUrl: row.speakerAvatarUrl ?? null,
          roomId: row.roomId ?? null,
          roomName: row.roomName ?? null,
          roomBuilding: row.roomBuilding ?? null,
          roomFloor: row.roomFloor ?? null,
          roomFloorPlanUrl: row.roomFloorPlanUrl ?? null,
        }));

        const nextCursor =
          items.length > 0
            ? Buffer.from(
                items[items.length - 1].registeredAt.toISOString()
              ).toString("base64")
            : null;

        return { items, nextCursor, hasMore, limit };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Cancels all active registrations for a workshop.
   *
   * Updates only registrations in CONFIRMED or PENDING_PAYMENT status —
   * already-cancelled records are left untouched.
   *
   * Side effects:
   * - Updates multiple rows in the registrations table.
   * - Sets cancelledAt and updatedAt on each affected row.
   *
   * @param workshopId - The UUID of the workshop being cancelled.
   * @param _tx - Reserved for future transaction support.
   * @returns OkResult with { cancelledCount: number } — the count of affected rows.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async cancelAllForWorkshop(
    workshopId: string,
    _tx?: DrizzleTransaction
  ): Promise<Result<CancelResult>> {
    return tryCatch(
      async () => {
        const result = await this.db
          .update(this.schema.registrations)
          .set({
            status: "CANCELLED",
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.schema.registrations.workshopId, workshopId),
              inArray(this.schema.registrations.status, [
                "CONFIRMED",
                "PENDING",
              ])
            )
          )
          .returning();

        return {
          cancelledCount: result.length,
          affectedStudentIds: result.map((r) => r.studentId),
        };
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Counts CONFIRMED registrations for a workshop.
   *
   * @param workshopId - UUID of the workshop.
   * @returns OkResult with the count, or FailResult (INTERNAL_ERROR).
   */
  async countConfirmedByWorkshop(workshopId: string): Promise<Result<number>> {
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

  /**
   * Finds registrations for a workshop with student info and check-in status.
   *
   * Used by the admin registration listing endpoint.
   *
   * @param workshopId - The UUID of the workshop.
   * @param filters - Optional status filter and pagination.
   * @returns OkResult with items array, or FailResult with INTERNAL_ERROR.
   */
  async findByWorkshopId(
    workshopId: string,
    filters?: {
      status?: string[];
      q?: string;
      checkedIn?: boolean;
      cursor?: string;
      limit?: number;
    }
  ): Promise<
    Result<{
      items: Array<{
        registrationId: string;
        workshopId: string;
        studentId: string;
        status: string;
        registeredAt: Date;
        studentName: string;
        studentEmail: string;
        checkedInAt: Date | null;
      }>;
      nextCursor: string | null;
      hasMore: boolean;
      limit: number;
    }>
  > {
    return tryCatch(
      async () => {
        const limit = filters?.limit ?? 20;
        const conditions: any[] = [
          eq(this.schema.registrations.workshopId, workshopId),
        ];
        if (filters?.status && filters.status.length > 0) {
          conditions.push(
            inArray(this.schema.registrations.status, filters.status as any[])
          );
        }

        if (filters?.q) {
          const pattern = `%${filters.q}%`;
          conditions.push(
            or(
              sql`${this.schema.students.fullName} ILIKE ${pattern}`,
              sql`${this.schema.students.email} ILIKE ${pattern}`,
              sql`${this.schema.students.studentId} ILIKE ${pattern}`
            )
          );
        }

        if (filters?.checkedIn === true) {
          conditions.push(isNotNull(this.schema.checkinRecords.checkedInAt));
        } else if (filters?.checkedIn === false) {
          conditions.push(isNull(this.schema.checkinRecords.checkedInAt));
        }

        if (filters?.cursor) {
          const cursorDate = new Date(
            Buffer.from(filters.cursor, "base64").toString("ascii")
          );
          conditions.push(
            lt(this.schema.registrations.registeredAt, cursorDate)
          );
        }

        const rows = await this.db
          .select({
            registrationId: this.schema.registrations.registrationId,
            workshopId: this.schema.registrations.workshopId,
            studentId: this.schema.registrations.studentId,
            status: this.schema.registrations.status,
            registeredAt: this.schema.registrations.registeredAt,
            studentName: this.schema.students.fullName,
            studentEmail: this.schema.students.email,
            checkedInAt: this.schema.checkinRecords.checkedInAt,
          })
          .from(this.schema.registrations)
          .leftJoin(
            this.schema.students,
            eq(
              this.schema.registrations.studentId,
              this.schema.students.studentId
            )
          )
          .leftJoin(
            this.schema.checkinRecords,
            eq(
              this.schema.registrations.registrationId,
              this.schema.checkinRecords.registrationId
            )
          )
          .where(and(...conditions))
          .orderBy(desc(this.schema.registrations.registeredAt))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        if (hasMore) rows.pop();

        const nextCursor =
          rows.length > 0
            ? Buffer.from(
                rows[rows.length - 1].registeredAt.toISOString()
              ).toString("base64")
            : null;

        return { items: rows as any, nextCursor, hasMore, limit };
      },
      (err) => systemErrors.internal(err)
    );
  }
}
