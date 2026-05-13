import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { Roles } from "@/shared/decorators/roles.decorator";

import { PaymentReconciliationService } from "../services/payment-reconciliation.service";

/**
 * PaymentsAdminController
 *
 * Admin-only endpoints for payment operations.
 * All endpoints require JWT authentication and BTC role.
 *
 * Endpoints:
 * - POST /admin/payments/reconcile — Manually trigger payment reconciliation
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BTC")
export class PaymentsAdminController {
  constructor(
    private readonly paymentReconciliationService: PaymentReconciliationService
  ) {}

  /**
   * Manually trigger payment reconciliation
   *
   * Runs the reconciliation job immediately instead of waiting for the
   * 5-minute cron schedule. Useful after a gateway incident to resolve
   * unresolved payments faster.
   *
   * Uses a PostgreSQL advisory lock: if the cron is already running, returns 409.
   *
   * @returns OkResult with reconciliation summary
   *         or FailResult (CONFLICT if cron already running)
   */
  @Post("admin/payments/reconcile")
  @HttpCode(HttpStatus.ACCEPTED)
  async reconcile() {
    return this.paymentReconciliationService.reconcile();
  }
}
