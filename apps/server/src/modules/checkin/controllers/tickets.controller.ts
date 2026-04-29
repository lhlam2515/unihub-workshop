/**
 * Tickets Controller
 *
 * Xử lý:
 * - GET /students/me/tickets
 * - GET /students/me/tickets/{id}
 *
 * Yêu cầu role STUDENT
 * IDOR protected bằng @CurrentUser()
 */

import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";

@Controller("students/me/tickets")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT")
export class TicketsController {
  constructor(private readonly ticketService: any) {}

  /**
   * GET /students/me/tickets
   * Get all active tickets for current student
   */
  @Get()
  async getMyTickets(@CurrentUser() user: any) {
    // TODO: Call ticketService.getMyTickets(user.id)
    // TODO: Return list of ACTIVE tickets with workshop info
  }

  /**
   * GET /students/me/tickets/{id}
   * Get single ticket detail
   */
  @Get(":id")
  async getMyTicket(@Param("id") ticketId: string, @CurrentUser() user: any) {
    // TODO: Verify ownership (IDOR protection)
    // TODO: Call ticketService.getTicketDetail(user.id, ticketId)
  }
}
