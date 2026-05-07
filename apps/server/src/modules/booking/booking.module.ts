import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { RateLimitModule } from "@/modules/rate-limit/rate-limit.module";

import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { PaymentModule } from "../payment/payment.module";
import { RegistrationsController } from "./controllers/registrations.controller";
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
 *
 * Imports:
 * - DatabaseModule — PostgreSQL access via Drizzle ORM
 * - RedisModule — distributed locks, rate counters
 * - CatalogModule — SeatCounterService for seat availability checks
 * - MessagingModule (global) — queue infrastructure for async operations
 * - PaymentModule — payments, circuit breaker, idempotency
 * - RateLimitModule — rate limiting (global + per-endpoint)
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
    IamModule,
    PaymentModule,
    RateLimitModule,
  ],
  controllers: [RegistrationsController],
  providers: [
    // Services
    RegistrationsService,
    TicketsService,
    // Mechanics
    SeatLockMechanic,
    // Repositories
    RegistrationsRepository,
    TicketsRepository,
  ],
  exports: [RegistrationsService, SeatLockMechanic],
})
export class BookingModule {}
