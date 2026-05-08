import { forwardRef, Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { HttpClientModule } from "@/infra/http-client/http-client.module";
import { MessagingModule } from "@/infra/messaging/messaging.module";
import { RedisModule } from "@/infra/redis/redis.module";

import { BookingModule } from "../booking/booking.module";
import { CatalogModule } from "../catalog/catalog.module";
import { IamModule } from "../iam/iam.module";
import { NotificationModule } from "../notification/notification.module";
import { PaymentsController } from "./controllers/payments.controller";
import { MockGatewayAdapter } from "./gateways/mock-gateway.adapter";
import { MomoGatewayAdapter } from "./gateways/momo-gateway.adapter";
import { PaymentGatewayFactory } from "./gateways/payment-gateway.factory";
import { StripeGatewayAdapter } from "./gateways/stripe-gateway.adapter";
import { VnpayGatewayAdapter } from "./gateways/vnpay-gateway.adapter";
import { HmacSignatureGuard } from "./guards/hmac-signature.guard";
import { CircuitBreakerMechanic } from "./mechanics/circuit-breaker.mechanic";
import { IdempotencyMechanic } from "./mechanics/idempotency.mechanic";
import { IdempotencyKeysRepository } from "./repositories/idempotency-keys.repository";
import { PaymentsRepository } from "./repositories/payments.repository";
import { PaymentGatewayService } from "./services/payment-gateway.service";
import { PaymentReconciliationService } from "./services/payment-reconciliation.service";
import { PaymentsService } from "./services/payments.service";

@Module({
  imports: [
    DatabaseModule,
    HttpClientModule,
    RedisModule,
    MessagingModule,
    forwardRef(() => BookingModule),
    CatalogModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [PaymentsController],
  providers: [
    // Services
    PaymentsService,
    PaymentGatewayService,
    PaymentReconciliationService,
    // Repositories
    PaymentsRepository,
    IdempotencyKeysRepository,
    // Mechanics
    CircuitBreakerMechanic,
    IdempotencyMechanic,
    // Guards (available for DI)
    HmacSignatureGuard,
    // Gateway adapters
    MockGatewayAdapter,
    VnpayGatewayAdapter,
    StripeGatewayAdapter,
    MomoGatewayAdapter,
    // Gateway factory — injects all adapters explicitly
    {
      provide: PaymentGatewayFactory,
      useFactory: (
        mock: MockGatewayAdapter,
        vnpay: VnpayGatewayAdapter,
        stripe: StripeGatewayAdapter,
        momo: MomoGatewayAdapter
      ) => new PaymentGatewayFactory([mock, vnpay, stripe, momo]),
      inject: [
        MockGatewayAdapter,
        VnpayGatewayAdapter,
        StripeGatewayAdapter,
        MomoGatewayAdapter,
      ],
    },
  ],
  exports: [
    PaymentsService,
    PaymentReconciliationService,
    CircuitBreakerMechanic,
    IdempotencyMechanic,
    PaymentsRepository,
    IdempotencyKeysRepository,
  ],
})
export class PaymentModule {}
