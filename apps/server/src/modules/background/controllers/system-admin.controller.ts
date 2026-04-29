import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import { UserRole } from "@database/types";
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles } from "@shared/decorators/roles.decorator";
import { Result } from "@shared/response/result";

import { SystemMonitorService } from "../services/system-monitor.service";

/**
 * SystemAdminController
 *
 * Handles system monitoring, background job status, and health checks.
 * All endpoints require ORGANIZER role.
 *
 * Endpoints:
 * - GET /admin/system/jobs/payment-timeout — Payment timeout job status
 * - GET /admin/system/jobs/reconciliation — Seat reconciliation job status
 * - GET /admin/system/circuit-breaker — Circuit breaker status for all gateways
 * - POST /admin/system/circuit-breaker/{gateway}/reset — Force reset circuit breaker
 *
 * TODO: Implement all endpoints
 */
@Controller("/admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER)
export class SystemAdminController {
  constructor(private readonly systemMonitorService: SystemMonitorService) {}

  // TODO: Implement GET /admin/system/jobs/payment-timeout
  @Get("jobs/payment-timeout")
  async getPaymentTimeoutJobStatus(): Promise<Result<any>> {
    // Call systemMonitorService.getPaymentTimeoutJobStatus()
    // Return: {
    //   pending_count: number,
    //   timeout_count: number,
    //   last_run: DateTime,
    //   next_run: DateTime,
    //   job_status: 'RUNNING' | 'IDLE' | 'ERROR'
    // }
  }

  // TODO: Implement GET /admin/system/jobs/reconciliation
  @Get("jobs/reconciliation")
  async getReconciliationJobStatus(): Promise<Result<any>> {
    // Call systemMonitorService.getReconciliationJobStatus()
    // Return: {
    //   total_workshops: number,
    //   discrepancies_found: number,
    //   last_run: DateTime,
    //   next_run: DateTime,
    //   last_alert?: string
    // }
  }

  // TODO: Implement GET /admin/system/circuit-breaker
  @Get("circuit-breaker")
  async getCircuitBreakerStatus(): Promise<Result<any>> {
    // Call systemMonitorService.getCircuitBreakerStatus()
    // Return array of circuit breaker statuses:
    // [
    //   {
    //     gateway: 'VNPAY' | 'MOMO' | 'STRIPE',
    //     state: 'CLOSED' | 'HALF_OPEN' | 'OPEN',
    //     failure_count: number,
    //     opened_at?: DateTime,
    //     last_attempt?: DateTime,
    //     recovery_deadline?: DateTime
    //   }
    // ]
  }

  // TODO: Implement POST /admin/system/circuit-breaker/{gateway}/reset
  @Post("circuit-breaker/:gateway/reset")
  @HttpCode(HttpStatus.OK)
  async resetCircuitBreaker(
    @Param("gateway") gateway: string
  ): Promise<Result<any>> {
    // Call systemMonitorService.resetCircuitBreaker(gateway)
    // Force reset circuit breaker state to CLOSED
    // Return updated circuit breaker state
  }
}
