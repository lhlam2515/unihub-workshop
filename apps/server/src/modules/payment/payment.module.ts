import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";
import { RedisModule } from "@/infra/redis/redis.module";

import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { PaymentsController } from "./controllers/payments.controller";
import { HmacSignatureGuard } from "./guards/hmac-signature.guard";
import { CircuitBreakerMechanic } from "./mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "./mechanics/idempotency.mechanic";
import { PaymentsRepository } from "./repositories/payments.repository";
import { PaymentGatewayService } from "./services/payment-gateway.service";
import { PaymentsService } from "./services/payments.service";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    SharedQueueModule,
    forwardRef(() => BookingModule),
    CatalogModule,
    IamModule,
  ],
  controllers: [PaymentsController],
  providers: [
    // Services
    PaymentsService,
    PaymentGatewayService,
    // Repositories
    PaymentsRepository,
    // Mechanics
    CircuitBreakerMechanic,
    IdempotencyMechanic,
    // Guards (available for DI)
    HmacSignatureGuard,
  ],
  exports: [PaymentsService, CircuitBreakerMechanic, IdempotencyMechanic, PaymentsRepository],
})
export class PaymentModule {}
