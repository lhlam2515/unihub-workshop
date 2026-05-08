import { Controller, Get, Param, Query } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";

import { ListWorkshopsQueryDto } from "../dto/list-workshops-query.dto";
import { WorkshopsService } from "../services/workshops.service";

@Controller("workshops")
export class WorkshopsPublicController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @RateLimit([{ tier: "T1", limit: 60, windowMs: 60000 }])
  @Get()
  @Public()
  async listPublished(@Query() query: ListWorkshopsQueryDto) {
    return this.workshopsService.listPublished(query);
  }

  @Get(":id")
  @Public()
  async getPublicDetail(@Param("id") id: string) {
    return this.workshopsService.getPublicDetail(id);
  }

  @Get(":id/availability")
  @Public()
  async getAvailability(@Param("id") id: string) {
    return this.workshopsService.getAvailability(id);
  }
}
