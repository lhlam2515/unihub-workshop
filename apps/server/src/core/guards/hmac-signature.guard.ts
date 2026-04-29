/**
 * HMAC Signature Verification Guard
 *
 * Xác thực webhook từ Payment Gateway thay cho JWT. Đọc X-Gateway-Signature header,
 * tính HMAC-SHA256 từ request body và so sánh với shared secret của từng gateway.
 * Trả 401 nếu chữ ký không hợp lệ. Áp dụng duy nhất cho POST /webhooks/payment/{gateway}.
 *
 * @see used in Booking Module - Payment Webhook
 */

import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class HmacSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // TODO: Implement HMAC signature verification
    // 1. Extract gateway from route params
    // 2. Get X-Gateway-Signature from headers
    // 3. Get shared secret for this gateway from config
    // 4. Calculate HMAC-SHA256(request.body, secret)
    // 5. Compare calculated signature with header signature
    // 6. Throw UnauthorizedException if signatures don't match

    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers["x-gateway-signature"] as string;
    const gateway = request.params.gateway;

    if (!signature) {
      throw new UnauthorizedException("Missing signature header");
    }

    // TODO: Verify signature against gateway secret
    // const calculatedSignature = calculateHmac(request.body, gatewaySecret);
    // if (calculatedSignature !== signature) {
    //   throw new UnauthorizedException('Invalid signature');
    // }

    return true;
  }
}
