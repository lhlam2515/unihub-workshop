import { Controller, Get, Param, Query } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";

import { ListPublicWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import { WorkshopsService } from "../services/workshops.service";

@Controller("workshops")
export class WorkshopsPublicController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @RateLimit([{ tier: "T1", limit: 60, windowMs: 60000 }])
  @Get()
  @Public()
  async listPublished(@Query() query: ListPublicWorkshopsQueryDto) {
    return this.workshopsService.listPublished(query);
  }

  @Get(":workshopId")
  @Public()
  async getPublicDetail(@Param("workshopId") workshopId: string) {
    return this.workshopsService.getPublicDetail(workshopId);
  }

  @Get(":workshopId/availability")
  @Public()
  async getAvailability(@Param("workshopId") workshopId: string) {
    return this.workshopsService.getAvailability(workshopId);
  }
}
