/**
 * Ticket Service
 *
 * issueTicket(registrationId): sinh qr_token, insert bảng tickets.
 * Chỉ được gọi sau khi Registration chuyển CONFIRMED.
 *
 * voidTicket(registrationId, tx?): cập nhật status = VOID.
 *
 * getMyTickets(studentId): trả ACTIVE tickets + workshop info.
 *
 * preloadActiveTickets(workshopId): trả toàn bộ ACTIVE tickets cho workshop.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class TicketService {
  constructor(
    private readonly ticketRepo: any, // TODO: Inject TicketsRepository
    private readonly registrationRepo: any // TODO: Inject RegistrationsRepository
  ) {}

  /**
   * issueTicket(registrationId: string, workshopId: string)
   *
   * TODO: Create ticket for confirmed registration
   * 1. Generate qr_token (JWT signed or UUID signed)
   * 2. Insert into tickets table with status=ACTIVE
   * 3. Return ticket entity
   */
  async issueTicket(registrationId: string, workshopId: string) {
    // TODO: Implement
  }

  /**
   * voidTicket(registrationId: string, tx?)
   *
   * TODO: Mark ticket as void
   * Used when canceling registration
   */
  async voidTicket(registrationId: string, tx?: any) {
    // TODO: Implement
  }

  /**
   * getMyTickets(studentId: string)
   *
   * TODO: Get all active tickets for student
   * Include workshop information
   */
  async getMyTickets(studentId: string) {
    // TODO: Implement
  }

  /**
   * getTicketDetail(studentId: string, ticketId: string)
   *
   * TODO: Get single ticket with full details
   */
  async getTicketDetail(studentId: string, ticketId: string) {
    // TODO: Implement
  }

  /**
   * preloadActiveTickets(workshopId: string)
   *
   * TODO: Get all active tickets for workshop
   * Used by check-in staff to preload on mobile app
   */
  async preloadActiveTickets(workshopId: string) {
    // TODO: Implement
  }
}
