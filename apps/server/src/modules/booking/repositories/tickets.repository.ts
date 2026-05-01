import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";
import type { DatabaseClient, DatabaseSchema } from "@/database";
import type { Ticket, NewTicket } from "@/database/types/transaction.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class TicketsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Creates a ticket for a confirmed registration.
   *
   * Side effects:
   * - Inserts a row into the tickets table.
   *
   * @param data - NewTicket payload with registrationId, qrToken, and status.
   * @returns OkResult with the created Ticket entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async create(data: NewTicket): Promise<Result<Ticket>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.tickets)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Finds the ticket associated with a registration.
   *
   * @param registrationId - The UUID of the registration.
   * @returns OkResult with the Ticket entity, or null if no ticket exists.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async findByRegistrationId(
    registrationId: string
  ): Promise<Result<Ticket | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.tickets)
          .where(eq(this.schema.tickets.registrationId, registrationId))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates a ticket's status and records void timestamp when voided.
   *
   * Automatically sets voidedAt to the current time when the new status is VOID.
   *
   * Side effects:
   * - Updates a row in the tickets table.
   *
   * @param id - The ticket UUID.
   * @param status - New status value (ACTIVE, VOID).
   * @returns OkResult with the updated Ticket entity.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  /**
   * Updates a ticket's status by registration ID directly.
   *
   * Eliminates the SELECT-then-UPDATE pattern when voiding tickets during
   * cancellation — safe to call even if no ticket exists (no-op).
   *
   * Side effects:
   * - Updates rows in the tickets table matching the registration ID.
   *
   * @param registrationId - The UUID of the registration whose ticket to update.
   * @param status - New status value (ACTIVE, VOID).
   * @returns OkResult<void> — always succeeds even if no ticket matched.
   * - May return FailResult with INTERNAL_ERROR on database failure.
   */
  async updateStatusByRegistrationId(
    registrationId: string,
    status: string
  ): Promise<Result<void>> {
    return tryCatch(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
        };
        if (status === "VOID") {
          updateData.voidedAt = new Date();
        }
        await this.db
          .update(this.schema.tickets)
          .set(updateData)
          .where(eq(this.schema.tickets.registrationId, registrationId));
      },
      (err) => systemErrors.internal(err)
    );
  }

  async updateStatus(id: string, status: string): Promise<Result<Ticket>> {
    return tryCatch(
      async () => {
        const updateData: Record<string, unknown> = {
          status,
        };
        if (status === "VOID") {
          updateData.voidedAt = new Date();
        }
        const [result] = await this.db
          .update(this.schema.tickets)
          .set(updateData)
          .where(eq(this.schema.tickets.ticketId, id))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }
}
