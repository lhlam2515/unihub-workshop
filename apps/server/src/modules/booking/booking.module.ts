import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { RedisModule } from "@/infra/redis/redis.module";

import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { PaymentModule } from "../payment/payment.module";
import { RegistrationsController } from "./controllers/registrations.controller";
import { GlobalRateLimitMechanic } from "./mechanics/global-rate-limit.mechanic";
import { RateLimiterMechanic } from "./mechanics/rate-limiter.mechanic";
import { SeatLockMechanic } from "./mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "./repositories/registrations.repository";
import { TicketsRepository } from "./repositories/tickets.repository";
import { RegistrationsService } from "./services/registrations.service";
import { TicketsService } from "./services/tickets.service";

/**
 * Booking Module
 *
 * Critical path module for the registration flow.
 *
 * Domain responsibilities:
 * - Workshop registration with seat locking (Redis)
 * - Ticket generation after registration confirmation
 * - Rate limiting (global + per-endpoint)
 *
 * Imports:
 * - DatabaseModule — PostgreSQL access via Drizzle ORM
 * - RedisModule — distributed locks, rate counters
 * - CatalogModule — SeatCounterService for seat availability checks
 * - SharedQueueModule — BullMQ queue definitions
 * - PaymentModule — payments, circuit breaker, idempotency
 *
 * Exports:
 * - RegistrationsService — consumed by BackgroundModule (reconciliation cron)
 * - SeatLockMechanic — consumed by PaymentModule (payment processing)
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    CatalogModule,
    SharedQueueModule,
    IamModule,
    PaymentModule,
  ],
  controllers: [RegistrationsController],
  providers: [
    // Services
    RegistrationsService,
    TicketsService,
    // Mechanics
    RateLimiterMechanic,
    SeatLockMechanic,
    GlobalRateLimitMechanic,
    // Repositories
    RegistrationsRepository,
    TicketsRepository,
  ],
  exports: [RegistrationsService, SeatLockMechanic],
})
export class BookingModule {}
