import { Injectable } from "@nestjs/common";

import { TokenService } from "@/modules/iam/services/token.service";

import { TicketsRepository } from "../repositories/tickets.repository";

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketsRepo: TicketsRepository,
    private readonly tokenService: TokenService
  ) {}

  /**
   * Signs a QR token with ticket metadata and persists it to the database.
   *
   * Replaces a placeholder QR (UUID) with a signed JWT containing ticket_id,
   * workshop_id, and student_id. Used by both free and paid registration flows.
   *
   * Side effects:
   * - Updates the `qr_token` column in the tickets table via the repository.
   *
   * @param ticketId - The UUID of the ticket to sign and update.
   * @param workshopId - The UUID of the workshop.
   * @param studentId - The UUID of the student.
   * @returns void — the update is performed asynchronously.
   */
  async signAndUpdateQrToken(
    ticketId: string,
    workshopId: string,
    studentId: string
  ): Promise<void> {
    const signedQrToken = this.tokenService.signQrToken({
      ticket_id: ticketId,
      workshop_id: workshopId,
      student_id: studentId,
    });
    await this.ticketsRepo.updateQrToken(ticketId, signedQrToken);
  }
}
