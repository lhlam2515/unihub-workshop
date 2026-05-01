/**
 * SystemAdminController
 *
 * Admin-only endpoints for monitoring and managing background system jobs
 * and infrastructure state.
 *
 * Security:
 * - All endpoints require JWT authentication and ORGANIZER role.
 * - Base path: /admin/system
 *
 * Endpoints:
 * - GET  /admin/system/jobs/payment-timeout   — Payment timeout cron status
 * - GET  /admin/system/jobs/reconciliation     — Seat reconciliation status
 * - GET  /admin/system/circuit-breaker          — All gateway circuit breaker states
 * - POST /admin/system/circuit-breaker/:gateway/reset — Force-reset a circuit breaker
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import type {
  CircuitBreakerStatusArrayDto,
  CircuitBreakerStatusDto,
  PaymentTimeoutJobStatusDto,
  ReconciliationJobStatusDto,
} from "../dto/system-monitor-response.dto";

import { SystemMonitorService } from "../services/system-monitor.service";

@Controller("/admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ORGANIZER")
export class SystemAdminController {
  constructor(private readonly systemMonitorService: SystemMonitorService) {}

  /**
   * Returns the current status of the payment timeout cron job.
   *
   * @returns OkResult with PaymentTimeoutJobStatusDto.
   */
  @Get("jobs/payment-timeout")
  async getPaymentTimeoutJobStatus(): Promise<
    Result<PaymentTimeoutJobStatusDto>
  > {
    return this.systemMonitorService.getPaymentTimeoutJobStatus();
  }

  /**
   * Returns the current status of the seat reconciliation cron job.
   *
   * @returns OkResult with ReconciliationJobStatusDto.
   */
  @Get("jobs/reconciliation")
  async getReconciliationJobStatus(): Promise<
    Result<ReconciliationJobStatusDto>
  > {
    return this.systemMonitorService.getReconciliationJobStatus();
  }

  /**
   * Returns circuit breaker states for all known payment gateways.
   *
   * @returns OkResult with CircuitBreakerStatusArrayDto.
   */
  @Get("circuit-breaker")
  async getCircuitBreakerStatus(): Promise<
    Result<CircuitBreakerStatusArrayDto>
  > {
    return this.systemMonitorService.getCircuitBreakerStatus();
  }

  /**
   * Forcefully resets a circuit breaker for a given gateway.
   *
   * @param gateway - The payment gateway identifier (VNPAY, MOMO, or STRIPE).
   * @returns OkResult with the updated CircuitBreakerStatusDto.
   */
  @Post("circuit-breaker/:gateway/reset")
  @HttpCode(HttpStatus.OK)
  async resetCircuitBreaker(
    @Param("gateway") gateway: string
  ): Promise<Result<CircuitBreakerStatusDto>> {
    return this.systemMonitorService.resetCircuitBreaker(gateway);
  }
}
