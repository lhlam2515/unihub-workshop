/**
 * Payments Controller
 *
 * Presentation layer for payment endpoints. Remains thin — extracts
 * validated params and delegates to PaymentsService.
 *
 * Endpoints:
 * - POST /payments — Create payment (STUDENT, requires X-Idempotency-Key).
 * - POST /webhooks/payment/{gateway} — Gateway webhook callback (PUBLIC + HMAC).
 * - GET /students/me/payments — List own payments (STUDENT).
 * - GET /students/me/payments/{id} — Payment detail (STUDENT, IDOR-enforced).
 *
 * Security:
 * - POST /payments, GET /students/me/payments/* → JWT + STUDENT role.
 * - POST /webhooks/payment/{gateway} → PUBLIC (HMAC signature verifies gateway).
 *
 * @see HmacSignatureGuard for webhook authentication details.
 */
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

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { HmacSignatureGuard } from "@/modules/payment/guards/hmac-signature.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { IdempotencyKey } from "@/shared/decorators/idempotency-key.decorator";
import { Public } from "@/shared/decorators/public.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreatePaymentDto } from "../dto/create-payment.dto";
import { PaymentWebhookDto } from "../dto/payment-webhook.dto";
import { PaymentsService } from "../services/payments.service";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments
   *
   * Initiates a payment for a paid workshop registration.
   * Requires X-Idempotency-Key header for duplicate prevention.
   *
   * @param dto - Zod-validated body with registration_id and gateway.
   * @param idempotencyKey - X-Idempotency-Key header value.
   * @param user - JWT payload providing student identity.
   * @returns HTTP 201 with CreatePaymentResponseDto (redirect_url + deadline),
   * or error response with codes:
   * - PAYMENT_DUPLICATE (409)
   * - PAYMENT_GATEWAY_OPEN (503)
   * - SEAT_LOCK_EXPIRED (410)
   * - REGISTRATION_NOT_FOUND (404)
   * - INTERNAL_ERROR (500)
   */
  @Post("payments")
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.paymentsService.initiate(user.sub, dto, idempotencyKey);
  }

  /**
   * POST /webhooks/payment/{gateway}
   *
   * Processes payment gateway webhook callbacks.
   * Authenticated via HMAC-SHA256 signature, not JWT.
   *
   * @param gateway - Gateway identifier from URL path.
   * @param webhookData - Zod-validated webhook payload with status and txn_id.
   * @returns HTTP 200 on successful processing,
   * or error response with codes:
   * - PAYMENT_NOT_FOUND (404)
   * - PAYMENT_ALREADY_SUCCESS (409)
   * - INTERNAL_ERROR (500)
   */
  @Post("webhooks/payment/:gateway")
  @Public()
  @UseGuards(HmacSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param("gateway") gateway: string,
    @Body() webhookData: PaymentWebhookDto
  ) {
    return this.paymentsService.handleWebhook(gateway, webhookData);
  }

  /**
   * GET /students/me/payments
   *
   * Lists the authenticated student's payments with pagination.
   * IDOR enforced at service layer — only own payments returned.
   *
   * @param user - JWT payload providing student identity.
   * @param query - Optional page and limit for pagination.
   * @returns Paginated list of PaymentResponseDto.
   */
  @Get("students/me/payments")
  async getMyPayments(
    @CurrentUser() user: JwtPayload,
    @Query() query: { page?: number; limit?: number }
  ) {
    return this.paymentsService.getMyPayments(user.sub, query);
  }

  /**
   * GET /students/me/payments/{id}
   *
   * Retrieves a single payment's detail with IDOR enforcement.
   * Returns PAYMENT_NOT_FOUND for both missing and non-owned payments.
   *
   * @param id - Payment UUID from path.
   * @param user - JWT payload providing student identity.
   * @returns PaymentResponseDto with payment details,
   * or PAYMENT_NOT_FOUND (404) if missing or owned by another student.
   */
  @Get("students/me/payments/:id")
  async getMyPayment(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.getPaymentDetail(user.sub, id);
  }
}
