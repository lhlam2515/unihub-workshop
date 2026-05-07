import { Injectable, Inject } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type {
  NewTicket,
  Ticket,
} from "@/infra/database/types/transaction.types";
import { systemErrors } from "@/shared/response/errors";
import { tryCatch } from "@/shared/response/result";
import type { Result } from "@/shared/response/result";

type TicketWithRegistration = Ticket & {
  registration: {
    registrationId: string;
    studentId: string;
    workshopId: string;
    workshop: {
      workshopId: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
    };
    student: { studentId: string; fullName: string; email?: string | null };
  };
};

type TicketWithWorkshopAndStudent = Ticket & {
  registration: {
    registrationId: string;
    studentId: string;
    workshopId: string;
    workshop: {
      workshopId: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
    };
    student: { studentId: string; fullName: string; email?: string | null };
  };
};

@Injectable()
export class TicketsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Retrieves a ticket by its QR token, joining registration, workshop, and student data.
   *
   * Database: Queries via `idx_tickets_qr_token` index for O(1) lookup. Eagerly loads
   * registration, workshop, and student relations in a single query.
   *
   * @param qrToken - The unique QR token value printed on the ticket.
   * @returns OkResult with the ticket and relations, or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findByQRToken(
    qrToken: string
  ): Promise<Result<TicketWithRegistration | null>> {
    return tryCatch(
      async () => {
        const result = await this.db.query.tickets.findFirst({
          where: eq(this.schema.tickets.qrToken, qrToken),
          with: {
            registration: {
              with: {
                workshop: true,
                student: true,
              },
            },
          },
        });
        return (result as unknown as TicketWithRegistration) ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves a ticket by its primary key, joining registration, workshop, and student data.
   *
   * Database: Queries by `ticket_id` PK. Eagerly loads registration, workshop, and student relations.
   *
   * @param id - UUID of the ticket.
   * @returns OkResult with the ticket and relations, or null if not found, or FailResult (INTERNAL_ERROR).
   */
  async findById(id: string): Promise<Result<TicketWithRegistration | null>> {
    return tryCatch(
      async () => {
        const result = await this.db.query.tickets.findFirst({
          where: eq(this.schema.tickets.ticketId, id),
          with: {
            registration: {
              with: {
                workshop: true,
                student: true,
              },
            },
          },
        });
        return (result as unknown as TicketWithRegistration) ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves all tickets for a student filtered by status.
   *
   * Database: Filters by status, then post-filters by studentId via the registration join.
   * IDOR safety: caller must pass jwt.sub as studentId — not enforced at DB level here.
   *
   * @param studentId - UUID of the student (must be jwt.sub to ensure IDOR protection).
   * @param status - Ticket status to filter by (ACTIVE or VOID).
   * @returns OkResult with matching tickets and relations, or FailResult (INTERNAL_ERROR).
   */
  async findByStudentIdAndStatus(
    studentId: string,
    status: "ACTIVE" | "VOID"
  ): Promise<Result<TicketWithRegistration[]>> {
    return tryCatch(
      async () => {
        const results = await this.db.query.tickets.findMany({
          where: eq(this.schema.tickets.status, status),
          with: {
            registration: {
              with: {
                workshop: true,
                student: true,
              },
            },
          },
        });
        return results.filter(
          (t) =>
            t.registration !== null && t.registration.studentId === studentId
        );
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves all tickets for a workshop filtered by status, ordered by issued date descending.
   *
   * Database: Filters by status, post-filters by workshopId via the registration join.
   * Used by staff pre-load to populate the mobile SQLite cache before going offline.
   *
   * @param workshopId - UUID of the workshop to fetch tickets for.
   * @param status - Ticket status to filter by (ACTIVE or VOID).
   * @returns OkResult with matching tickets and relations, or FailResult (INTERNAL_ERROR).
   */
  async findByWorkshopIdAndStatus(
    workshopId: string,
    status: "ACTIVE" | "VOID"
  ): Promise<Result<TicketWithWorkshopAndStudent[]>> {
    return tryCatch(
      async () => {
        const results = await this.db.query.tickets.findMany({
          where: eq(this.schema.tickets.status, status),
          orderBy: desc(this.schema.tickets.issuedAt),
          with: {
            registration: {
              with: {
                workshop: true,
                student: true,
              },
            },
          },
        });
        return results.filter(
          (t) =>
            t.registration !== null && t.registration.workshopId === workshopId
        );
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Retrieves the ticket associated with a registration, if one exists.
   *
   * Database: Queries by `registration_id` (unique constraint). Returns null if no ticket
   * has been issued yet for this registration.
   *
   * @param registrationId - UUID of the registration.
   * @returns OkResult with the ticket or null, or FailResult (INTERNAL_ERROR).
   */
  async findByRegistrationId(
    registrationId: string
  ): Promise<Result<Ticket | null>> {
    return tryCatch(
      async () => {
        const result = await this.db.query.tickets.findFirst({
          where: eq(this.schema.tickets.registrationId, registrationId),
        });
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Inserts a new ticket record into the database.
   *
   * Database: INSERT INTO tickets. Unique constraint on `registration_id` prevents
   * duplicate tickets for the same registration.
   *
   * Side effects:
   * - Writes a new row to the `tickets` table.
   *
   * @param data - New ticket data including registrationId, qrToken, and status.
   * @returns OkResult with the inserted ticket, or FailResult (INTERNAL_ERROR).
   */
  async create(data: NewTicket): Promise<Result<Ticket>> {
    return tryCatch(
      async () => {
        const [inserted] = await this.db
          .insert(this.schema.tickets)
          .values(data)
          .returning();
        return inserted;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a ticket's status and sets voided_at when voiding.
   *
   * Side effects:
   * - Updates `tickets.status` and `tickets.voided_at` for the given ticket_id.
   *
   * @param id - UUID of the ticket to update.
   * @param status - New status (ACTIVE or VOID).
   * @returns OkResult with the updated ticket, or FailResult (INTERNAL_ERROR).
   */
  async updateStatus(
    id: string,
    status: "ACTIVE" | "VOID"
  ): Promise<Result<Ticket>> {
    return tryCatch(
      async () => {
        const [updated] = await this.db
          .update(this.schema.tickets)
          .set({ status, voidedAt: status === "VOID" ? new Date() : null })
          .where(eq(this.schema.tickets.ticketId, id))
          .returning();
        return updated;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
