import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/database/database.module";
import { SharedQueueModule } from "@/shared/queues/queue.module";
import { RedisModule } from "@/shared/redis/redis.module";

import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { PaymentsController } from "./controllers/payments.controller";
import { RegistrationsController } from "./controllers/registrations.controller";
import { CircuitBreakerMechanic } from "./mechanics/circuit-breaker.mechanic";
import { GlobalRateLimitMechanic } from "./mechanics/global-rate-limit.mechanic";
import { IdempotencyMechanic } from "./mechanics/idempotency.mechanic";
import { RateLimiterMechanic } from "./mechanics/rate-limiter.mechanic";
import { SeatLockMechanic } from "./mechanics/seat-lock.mechanic";
import { PaymentsRepository } from "./repositories/payments.repository";
import { RegistrationsRepository } from "./repositories/registrations.repository";
import { TicketsRepository } from "./repositories/tickets.repository";
import { PaymentGatewayService } from "./services/payment-gateway.service";
import { PaymentsService } from "./services/payments.service";
import { RegistrationsService } from "./services/registrations.service";

/**
 * Booking Module
 *
 * Critical path module for the registration-to-payment flow.
 *
 * Domain responsibilities:
 * - Workshop registration with seat locking (Redis)
 * - Payment processing via multiple gateways and webhooks
 * - Rate limiting (global + per-endpoint) and idempotency checks
 * - Circuit breaker for payment gateway failure isolation
 *
 * Imports:
 * - DatabaseModule — PostgreSQL access via Drizzle ORM
 * - RedisModule — distributed locks, rate counters, circuit breaker state
 * - CatalogModule — SeatCounterService for seat availability checks
 * - SharedQueueModule — BullMQ queue definitions for payment-timeout jobs
 *
 * Exports:
 * - RegistrationsService — consumed by BackgroundModule (reconciliation cron)
 * - PaymentsService — consumed by BackgroundModule (reconciliation cron)
 * - SeatLockMechanic — consumed by CatalogModule (workshop cancellation flow)
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    CatalogModule,
    SharedQueueModule,
    IamModule,
  ],
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
    TicketsRepository,
    PaymentsRepository,
  ],
  exports: [RegistrationsService, PaymentsService, SeatLockMechanic],
})
export class BookingModule {}
