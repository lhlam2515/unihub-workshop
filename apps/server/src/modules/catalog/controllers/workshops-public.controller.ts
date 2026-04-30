/**
 * Workshops Public Controller
 *
 * Serves public-facing workshop endpoints accessible without authentication.
 * All endpoints are marked with @Public() to bypass JwtAuthGuard.
 *
 * Endpoints:
 * - GET /workshops — list published workshops with filters
 * - GET /workshops/:id — get public detail of a single workshop
 */

import { Controller, Get, Param, Query } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";

import { ListWorkshopsQuerySchema } from "../dto/list-workshops-query.dto";
import { WorkshopsService } from "../services/workshops.service";

@Controller("workshops")
export class WorkshopsPublicController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  /**
   * Lists published workshops for public browsing.
   *
   * Route: GET /workshops
   * Security: @Public() — no authentication required.
   * Supports optional filtering by faculty, date range, and payment type.
   * Results are paginated with configurable page and limit.
   *
   * @param query - Query parameters for filtering and pagination (faculty, date_from, date_to, is_paid, page, limit).
   * @returns Paginated list of published workshops with available seat counts.
   */
  @Get()
  @Public()
  async listPublished(@Query() query: any) {
    const parsed = ListWorkshopsQuerySchema.parse(query);
    return this.workshopsService.listPublished(parsed);
  }

  /**
   * Retrieves public details of a single workshop by ID.
   *
   * Route: GET /workshops/:id
   * Security: @Public() — no authentication required.
   * Only published workshops are returned. Includes available seat count
   * sourced from Redis for real-time accuracy.
   *
   * @param id - The UUID of the workshop.
   * @returns Workshop detail DTO with real-time seat availability, or delegates 404/403 via service fail.
   */
  @Get(":id")
  @Public()
  async getPublicDetail(@Param("id") id: string) {
    return this.workshopsService.getPublicDetail(id);
  }
}
