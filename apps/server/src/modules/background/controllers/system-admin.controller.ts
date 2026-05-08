/**
 * SystemAdminController
 *
 * Admin-only endpoints for monitoring and managing background system jobs
 * and infrastructure state.
 *
 * Security:
 * - All endpoints require JWT authentication and BTC role.
 * - Base path: /admin/system
 *
 * Endpoints:
 * - GET  /admin/system/jobs/payment-timeout      — Payment timeout cron status
 * - GET  /admin/system/jobs/reconciliation        — Seat reconciliation status
 * - GET  /admin/system/circuit-breaker            — All gateway circuit breaker states
 * - POST /admin/system/circuit-breaker/:gateway/reset — Force-reset a circuit breaker
 * - POST /admin/payments/reconcile                — Trigger payment reconciliation
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

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import { Result } from "@/shared/response/result";

import { PaymentReconciliationService } from "@/modules/payment/services/payment-reconciliation.service";
import { SystemMonitorService } from "../services/system-monitor.service";

import type {
  CircuitBreakerStatusArrayDto,
  CircuitBreakerStatusDto,
  PaymentTimeoutJobStatusDto,
  ReconciliationJobStatusDto,
} from "../dto/system-monitor-response.dto";

@Controller("/admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
@RateLimit([{ tier: "T2", limit: 30, windowMs: 60000 }])
export class SystemAdminController {
  constructor(
    private readonly systemMonitorService: SystemMonitorService,
    private readonly paymentReconciliationService: PaymentReconciliationService
  ) {}

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

  /**
   * POST /admin/payments/reconcile
   *
   * Triggers a manual reconciliation cycle for UNRESOLVED payments.
   * Queries each payment's gateway adapter to determine actual status
   * and updates the local database accordingly.
   *
   * Business rules:
   * - Uses advisory lock to prevent concurrent reconciliation runs.
   * - Returns 202 Accepted immediately if lock acquired.
   * - Returns 409 Conflict if another reconciliation is already running.
   *
   * @returns OkResult with job metadata (jobId, startedAt, unresolvedCount).
   */
  @Post("payments/reconcile")
  @HttpCode(HttpStatus.ACCEPTED)
  async reconcilePayments(): Promise<
    Result<{
      jobId: string;
      startedAt: string;
      unresolvedCount: number;
    }>
  > {
    return this.paymentReconciliationService.reconcile();
  }
}
