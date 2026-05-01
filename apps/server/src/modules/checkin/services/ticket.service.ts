import { Injectable } from "@nestjs/common";

import { ticketErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import {
  TicketResponseBuilder,
  type TicketResponseDto,
} from "../dto/ticket-response.dto";
import { TicketsRepository } from "../repositories/tickets.repository";

@Injectable()
export class TicketService {
  constructor(private readonly ticketsRepo: TicketsRepository) {}

  /**
   * Issues a new ticket for a confirmed registration.
   *
   * Side effects:
   * - Inserts a record into the `tickets` table with status=ACTIVE and a random UUID as qr_token.
   *
   * @param registrationId - UUID of the confirmed registration.
   * @returns OkResult with ticketId and qrToken, or FailResult (INTERNAL_ERROR).
   */
  async issueTicket(
    registrationId: string
  ): Promise<Result<{ ticketId: string; qrToken: string }>> {
    const result = await this.ticketsRepo.create({
      registrationId,
      qrToken: crypto.randomUUID(),
      status: "ACTIVE",
    });

    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      ticketId: result.data.ticketId,
      qrToken: result.data.qrToken,
    });
  }

  /**
   * Voids the ticket associated with a registration.
   *
   * Business rules:
   * - If no ticket exists for the registration, this is a no-op (idempotent).
   *
   * Side effects:
   * - Updates `tickets.status = VOID` and sets `voided_at = now()`.
   *
   * @param registrationId - UUID of the registration whose ticket should be voided.
   * @returns OkResult on success or no-op, or FailResult (INTERNAL_ERROR).
   */
  async voidTicket(registrationId: string): Promise<Result<void>> {
    const findResult =
      await this.ticketsRepo.findByRegistrationId(registrationId);
    if (findResult.isFailure) return Result.fail(findResult.error);
    if (!findResult.data) return Result.ok();

    const updateResult = await this.ticketsRepo.updateStatus(
      findResult.data.ticketId,
      "VOID"
    );
    if (updateResult.isFailure) return Result.fail(updateResult.error);

    return Result.ok();
  }

  /**
   * Retrieves all active tickets for a student.
   *
   * Business rules:
   * - Results are scoped to the authenticated student (IDOR protection via jwt.sub).
   * - Only ACTIVE tickets are returned.
   *
   * @param studentId - UUID of the student (from jwt.sub).
   * @returns OkResult with list of TicketResponseDto, or FailResult (INTERNAL_ERROR).
   */
  async getMyTickets(studentId: string): Promise<Result<TicketResponseDto[]>> {
    const result = await this.ticketsRepo.findByStudentIdAndStatus(
      studentId,
      "ACTIVE"
    );
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok(result.data.map((t) => TicketResponseBuilder.from(t)));
  }

  /**
   * Retrieves a single ticket for a student, enforcing ownership.
   *
   * Business rules:
   * - Returns 404 (not 403) if ticket doesn't belong to the student, to avoid confirming existence.
   *
   * @param studentId - UUID of the authenticated student (from jwt.sub).
   * @param ticketId - UUID of the requested ticket.
   * @returns OkResult with TicketResponseDto, or FailResult (TICKET_NOT_FOUND, INTERNAL_ERROR).
   */
  async getTicketDetail(
    studentId: string,
    ticketId: string
  ): Promise<Result<TicketResponseDto>> {
    const result = await this.ticketsRepo.findById(ticketId);
    if (result.isFailure) return Result.fail(result.error);

    if (!result.data || result.data.registration.studentId !== studentId) {
      return Result.fail(ticketErrors.notFound(ticketId));
    }

    return Result.ok(TicketResponseBuilder.from(result.data));
  }

  /**
   * Retrieves all active tickets for a workshop for staff pre-load.
   *
   * Business rules:
   * - Only ACTIVE tickets are returned (VOID tickets are excluded from cache).
   * - WorkshopScopeGuard enforces that staff can only access their assigned workshops.
   *
   * @param workshopId - UUID of the workshop to preload tickets for.
   * @returns OkResult with list of TicketResponseDto, or FailResult (INTERNAL_ERROR).
   */
  async preloadActiveTickets(
    workshopId: string
  ): Promise<Result<TicketResponseDto[]>> {
    const result = await this.ticketsRepo.findByWorkshopIdAndStatus(
      workshopId,
      "ACTIVE"
    );
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok(result.data.map((t) => TicketResponseBuilder.from(t)));
  }
}
