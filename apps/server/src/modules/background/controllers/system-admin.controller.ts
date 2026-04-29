import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import { SystemMonitorService } from "../services/system-monitor.service";

@Controller("/admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class SystemAdminController {
  constructor(private readonly systemMonitorService: SystemMonitorService) {}

  @Get("jobs/payment-timeout")
  async getPaymentTimeoutJobStatus(): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get("jobs/reconciliation")
  async getReconciliationJobStatus(): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Get("circuit-breaker")
  async getCircuitBreakerStatus(): Promise<Result<any>> {
    throw new Error("Not implemented");
  }

  @Post("circuit-breaker/:gateway/reset")
  @HttpCode(HttpStatus.OK)
  async resetCircuitBreaker(
    @Param("gateway") gateway: string
  ): Promise<Result<any>> {
    throw new Error("Not implemented");
  }
}
