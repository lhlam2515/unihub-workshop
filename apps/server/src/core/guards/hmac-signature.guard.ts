/**
 * HMAC Signature Verification Guard
 *
 * Authenticates incoming webhook requests from external payment gateways.
 * Instead of JWT, it validates the `X-Gateway-Signature` header by computing
 * an HMAC-SHA256 digest of the raw request body and comparing it against the
 * expected signature using a timing-safe comparison.
 *
 * Lifecycle position: Stage 1 — Inbound Security (replaces JwtAuthGuard for webhooks).
 * Depends on: `PAYMENT_GATEWAY_SECRETS` environment variable.
 *
 * Verification flow:
 * 1. Extract the gateway name from `request.params.gateway`.
 * 2. Read the `X-Gateway-Signature` header.
 * 3. Look up the shared secret for the specified gateway.
 * 4. Compute `HMAC-SHA256(rawBody, secret)`.
 * 5. Compare the computed digest with the header value using `timingSafeEqual`.
 *
 * Configuration:
 * - `PAYMENT_GATEWAY_SECRETS` — JSON-encoded map of gateway names to shared secrets.
 *   Example: `{"vnpay":"secret1","momo":"secret2","stripe":"secret3"}`
 *
 * Error mapping (caught by GlobalExceptionFilter):
 * - Missing gateway param → 401 "Missing gateway parameter"
 * - Missing signature header → 401 "Missing signature header"
 * - Unknown gateway → 401 "Unknown payment gateway"
 * - Signature mismatch → 401 "Invalid signature"
 *
 * @see used in Booking Module — Payment Webhook controller
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";

/**
 * Loads gateway shared secrets from the `PAYMENT_GATEWAY_SECRETS` environment variable.
 *
 * The value must be a JSON-encoded object mapping gateway identifiers to their
 * corresponding HMAC shared secrets.
 *
 * @returns A map of gateway names to secrets, or an empty object if not configured.
 */
function loadGatewaySecrets(): Record<string, string> {
  const raw = process.env.PAYMENT_GATEWAY_SECRETS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

const GATEWAY_SECRETS: Record<string, string> = loadGatewaySecrets();

@Injectable()
export class HmacSignatureGuard implements CanActivate {
  /**
   * Verifies the HMAC-SHA256 signature of an incoming payment webhook.
   *
   * Business rules:
   * - Each payment gateway has a unique shared secret used to sign webhook payloads.
   * - The `X-Gateway-Signature` header MUST match the computed HMAC-SHA256 of the
   *   raw request body using a timing-safe comparison to prevent timing attacks.
   * - Unrecognized gateway names are rejected immediately.
   *
   * @param context - NestJS execution context providing access to the HTTP request.
   * @returns `true` if the signature is valid.
   * @throws UnauthorizedException if the gateway is unknown, the signature header
   *         is missing, or the computed signature does not match.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers["x-gateway-signature"] as string;
    const gateway = request.params.gateway as string;

    if (!gateway) {
      throw new UnauthorizedException("Missing gateway parameter");
    }

    if (!signature) {
      throw new UnauthorizedException("Missing signature header");
    }

    const secret = GATEWAY_SECRETS[gateway];
    if (!secret) {
      throw new UnauthorizedException("Unknown payment gateway");
    }

    const rawBody =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

    const computed = createHmac("sha256", secret).update(rawBody).digest("hex");

    const computedBuffer = Buffer.from(computed);
    const signatureBuffer = Buffer.from(signature);

    if (
      computedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(computedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException("Invalid signature");
    }

    return true;
  }
}
