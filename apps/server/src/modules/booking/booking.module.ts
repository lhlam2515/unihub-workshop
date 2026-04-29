/**
 * Booking Module
 *
 * Critical path module — handles:
 * - Registration (workshop signup)
 * - Payments (multiple gateways, webhooks)
 * - Rate limiting and seat management
 * - Idempotency and circuit breaker
 *
 * Imports: DatabaseModule, RedisModule, CatalogModule (SeatCounterService)
 */

import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/database/database.module";
import { RedisModule } from "@/shared/redis/redis.module";

import { CatalogModule } from "../catalog/catalog.module";
import { PaymentsController } from "./controllers/payments.controller";
import { RegistrationsController } from "./controllers/registrations.controller";
import { CircuitBreakerMechanic } from "./mechanics/circuit-breaker.mechanic";
import { GlobalRateLimitMechanic } from "./mechanics/global-rate-limit.mechanic";
import { IdempotencyMechanic } from "./mechanics/idempotency.mechanic";
import { RateLimiterMechanic } from "./mechanics/rate-limiter.mechanic";
import { SeatLockMechanic } from "./mechanics/seat-lock.mechanic";
import { PaymentsRepository } from "./repositories/payments.repository";
import { RegistrationsRepository } from "./repositories/registrations.repository";
import { PaymentGatewayService } from "./services/payment-gateway.service";
import { PaymentsService } from "./services/payments.service";
import { RegistrationsService } from "./services/registrations.service";

@Module({
  imports: [DatabaseModule, RedisModule, CatalogModule],
  controllers: [RegistrationsController, PaymentsController],
  providers: [
    // Services
    RegistrationsService,
    PaymentsService,
    PaymentGatewayService,
    // Mechanics
    RateLimiterMechanic,
    SeatLockMechanic,
    IdempotencyMechanic,
    CircuitBreakerMechanic,
    GlobalRateLimitMechanic,
    // Repositories
    RegistrationsRepository,
    PaymentsRepository,
  ],
  exports: [RegistrationsService, PaymentsService],
})
export class BookingModule {}
