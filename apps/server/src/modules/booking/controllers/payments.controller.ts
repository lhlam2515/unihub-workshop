/**
 * Payments Controller
 *
 * Xử lý:
 * - POST /payments (STUDENT — yêu cầu @IdempotencyKey())
 * - POST /webhooks/payment/{gateway} (PUBLIC + HmacSignatureGuard)
 * - GET /students/me/payments (STUDENT)
 * - GET /students/me/payments/{id} (STUDENT)
 */

import { HmacSignatureGuard } from "@core/guards/hmac-signature.guard";
import { JwtAuthGuard } from "@core/guards/jwt-auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CurrentUser } from "@shared/decorators/current-user.decorator";
import { IdempotencyKey } from "@shared/decorators/idempotency-key.decorator";
import { Public } from "@shared/decorators/public.decorator";
import { Roles } from "@shared/decorators/roles.decorator";

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: any) {}

  /**
   * POST /payments
   * Create payment — requires X-Idempotency-Key header
   */
  @Post("payments")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("STUDENT")
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() createDto: any,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: any
  ) {
    // TODO: Validate with Zod (CreatePaymentSchema)
    // TODO: Call paymentsService.initiate(user.id, createDto, idempotencyKey)
    // TODO: Return redirect URL
  }

  /**
   * POST /webhooks/payment/{gateway}
   * Webhook from payment gateway
   */
  @Post("webhooks/payment/:gateway")
  @Public()
  @UseGuards(HmacSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param("gateway") gateway: string,
    @Body() webhookDto: any
  ) {
    // TODO: Validate with Zod (PaymentWebhookSchema)
    // TODO: Call paymentsService.handleWebhook(gateway, webhookDto)
  }

  /**
   * GET /students/me/payments
   */
  @Get("students/me/payments")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("STUDENT")
  async getMyPayments(@CurrentUser() user: any, @Query() query: any) {
    // TODO: Call paymentsService.getMyPayments(user.id, query)
  }

  /**
   * GET /students/me/payments/{id}
   */
  @Get("students/me/payments/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("STUDENT")
  async getMyPayment(@Param("id") id: string, @CurrentUser() user: any) {
    // TODO: Verify ownership
    // TODO: Call paymentsService.getPaymentDetail(user.id, id)
  }
}
