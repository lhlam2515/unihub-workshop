import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { MessagingModule } from "@/infra/messaging/messaging.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { RateLimitModule } from "@/modules/rate-limit/rate-limit.module";

import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { NotificationModule } from "../notification/notification.module";
import { PaymentModule } from "../payment/payment.module";
import { RegistrationsController } from "./controllers/registrations.controller";
import { SeatLockMechanic } from "./mechanics/seat-lock.mechanic";
import { RegistrationsRepository } from "./repositories/registrations.repository";
import { RegistrationsService } from "./services/registrations.service";

/**
 * Booking Module
 *
 * Critical path module for the registration flow.
 *
 * Domain responsibilities:
 * - Workshop registration with seat locking (Redis)
 * - QR code generation for confirmed registrations
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    CatalogModule,
    MessagingModule,
    IamModule,
    NotificationModule,
    forwardRef(() => PaymentModule),
    RateLimitModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, SeatLockMechanic, RegistrationsRepository],
  exports: [RegistrationsService, SeatLockMechanic, RegistrationsRepository],
})
export class BookingModule {}
