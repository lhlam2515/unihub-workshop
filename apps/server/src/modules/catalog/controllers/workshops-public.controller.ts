/**
 * Workshops Public Controller
 *
 * Xử lý:
 * - GET /workshops (list public workshops)
 * - GET /workshops/{workshop_id} (public detail)
 *
 * Cả hai endpoint là @Public()
 * Truy vấn available_seats từ Redis, không từ PostgreSQL
 */

import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "@shared/decorators/public.decorator";

import { WorkshopsService } from "../services/workshops.service";

@Controller("workshops")
export class WorkshopsPublicController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  /**
   * GET /workshops
   * @query faculty, date_from, date_to, is_paid, page, limit
   * @returns paginated list of WorkshopSummaryDto
   */
  @Get()
  @Public()
  async listPublished(@Query() query: any) {
    // TODO: Validate query with Zod (ListWorkshopsQuerySchema)
    // TODO: Call workshopsService.listPublished(query)
    // TODO: For each workshop, get available_seats from Redis (seat:available:{id})
  }

  /**
   * GET /workshops/{id}
   * @returns WorkshopDetailDto with available_seats from Redis
   */
  @Get(":id")
  @Public()
  async getPublicDetail(@Param("id") id: string) {
    // TODO: Call workshopsService.getPublicDetail(id)
    // TODO: Get available_seats from Redis
  }
}
