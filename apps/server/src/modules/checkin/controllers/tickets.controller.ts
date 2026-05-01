import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { TicketService } from "../services/ticket.service";

@Controller("students/me/tickets")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT")
export class TicketsController {
  constructor(private readonly ticketService: TicketService) {}

  /**
   * Retrieves all active tickets for the authenticated student.
   *
   * Business rules:
   * - Results are scoped to jwt.sub (IDOR protection — student cannot access other students' tickets).
   *
   * @param user - Authenticated STUDENT payload from JWT.
   * @returns List of TicketResponseDto with workshop info and QR token.
   */
  @Get()
  async getMyTickets(@CurrentUser() user: JwtPayload) {
    return this.ticketService.getMyTickets(user.sub);
  }

  /**
   * Retrieves a single ticket for the authenticated student.
   *
   * Business rules:
   * - Returns 404 (not 403) when ticket doesn't belong to the student, to avoid confirming existence.
   *
   * @param ticketId - UUID of the requested ticket.
   * @param user - Authenticated STUDENT payload from JWT.
   * @returns TicketResponseDto, or FailResult (TICKET_NOT_FOUND).
   */
  @Get(":id")
  async getMyTicket(
    @Param("id") ticketId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.ticketService.getTicketDetail(user.sub, ticketId);
  }
}
