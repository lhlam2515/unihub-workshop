/**
 * Payments Controller
 *
 * Presentation layer for payment endpoints. Remains thin — extracts
 * validated params and delegates to PaymentsService.
 *
 * Endpoints:
 * - POST /payments — Create payment (STUDENT, requires X-Idempotency-Key).
 * - POST /payments/webhook/{gateway} — Gateway webhook callback (PUBLIC + HMAC).
 * - GET /students/me/payments — List own payments (STUDENT).
 * - GET /payments/{paymentId} — Payment detail (STUDENT, IDOR-enforced).
 *
 * Security:
 * - POST /payments, GET /students/me/payments, GET /payments/{paymentId} → JWT + STUDENT role.
 * - POST /payments/webhook/{gateway} → PUBLIC (HMAC signature verifies gateway).
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

import { HmacSignatureGuard } from "@/modules/payment/guards/hmac-signature.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { IdempotencyKey } from "@/shared/decorators/idempotency-key.decorator";
import { Public } from "@/shared/decorators/public.decorator";
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Roles } from "@/shared/decorators/roles.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { CreatePaymentDto } from "../dto/create-payment.dto";
import { PaymentWebhookDto } from "../dto/payment-webhook.dto";
import { PaymentsService } from "../services/payments.service";

@Controller()
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
  @RateLimit([
    { tier: "T2", limit: 30, windowMs: 60000 },
    {
      tier: "T3",
      limit: 5,
      windowMs: 60000,
      resourceIdSource: "body.registrationId",
    },
  ])
  @Post("payments")
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.paymentsService.initiate(user.studentId!, dto, idempotencyKey);
  }

  /**
   * POST /payments/webhook/{gateway}
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
  @Post("payments/webhook/:gateway")
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
   * Lists the authenticated student's payments with cursor-based pagination.
   * IDOR enforced at service layer — only own payments returned.
   *
   * @param user - JWT payload providing student identity.
   * @param query - Optional cursor (opaque base64 token) and limit for pagination.
   * @returns Cursor-paginated list of PaymentResponseDto.
   */
  @Get("students/me/payments")
  async getMyPayments(
    @CurrentUser() user: JwtPayload,
    @Query() query: { cursor?: string; limit?: number }
  ) {
    return this.paymentsService.getMyPayments(user.studentId!, query);
  }

  /**
   * GET /payments/{paymentId}
   *
   * Retrieves a single payment's detail with IDOR enforcement.
   * Returns PAYMENT_NOT_FOUND for both missing and non-owned payments.
   *
   * @param paymentId - Payment UUID from path.
   * @param user - JWT payload providing student identity.
   * @returns PaymentResponseDto with payment details,
   * or PAYMENT_NOT_FOUND (404) if missing or owned by another student.
   */
  @Get("payments/:paymentId")
  async getMyPayment(
    @Param("paymentId") paymentId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.paymentsService.getPaymentDetail(user.studentId!, paymentId);
  }
}
