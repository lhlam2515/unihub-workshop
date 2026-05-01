## 1. Mechanics — Idempotency & Circuit Breaker

- [x] 1.1 Implement `IdempotencyMechanic.check()` — SET NX `idempotency:{key}` with TTL 86400, return existing payment_id if key exists
- [x] 1.2 Implement `IdempotencyMechanic.setPaymentId()` — update Redis key value from placeholder to actual payment_id
- [x] 1.3 Implement `CircuitBreakerMechanic.checkAndAllow()` — read Redis Hash `circuit:payment:{gateway}`, check state machine (CLOSED→allow, OPEN→check cooldown→HALF_OPEN, HALF_OPEN→reject)
- [x] 1.4 Implement `CircuitBreakerMechanic.recordSuccess()` — HALF_OPEN→CLOSED reset, CLOSED→reset failure_count
- [x] 1.5 Implement `CircuitBreakerMechanic.recordFailure()` — increment failure_count, transition to OPEN at threshold ≥5

## 2. Data Access — Payments Repository

- [x] 2.1 Implement `PaymentsRepository.findByIdempotencyKey()` — SELECT by idempotency_key with tryCatch wrapper
- [x] 2.2 Implement `PaymentsRepository.create()` — INSERT payment with optional transaction support
- [x] 2.3 Implement `PaymentsRepository.updateStatus()` — UPDATE payment status, gateway_txn_id, completed_at with optional transaction
- [x] 2.4 Implement `PaymentsRepository.findMyPayments()` — paginated SELECT with student_id filter (IDOR), ordered by initiated_at DESC
- [x] 2.5 Implement `PaymentsRepository.findPendingOverdue()` — SELECT payments WHERE status=PENDING AND timeout_at < NOW()

## 3. External Boundary — Payment Gateway Adapter

- [x] 3.1 Implement `PaymentGatewayService.initiatePayment()` — switch on gateway, MOCK case returns fake redirect_url and gateway_txn_id
- [x] 3.2 Implement `PaymentGatewayService.verifyHmacSignature()` — switch on gateway, MOCK case returns true

## 4. Presentation Data — Response DTOs

- [x] 4.1 Implement `PaymentResponseBuilder.from()` — map Payment entity to PaymentResponseDto, strip raw_gateway_response
- [x] 4.2 Implement `PaymentResponseBuilder.fromCreate()` — map payment entity + redirect_url + deadline to CreatePaymentResponseDto

## 5. Business Logic — Payments Service

- [x] 5.1 Implement `PaymentsService.initiate()` — 5-stage pipeline: seat lock check → idempotency → circuit breaker → INSERT payment → gateway call, return redirect URL
- [x] 5.2 Implement `PaymentsService.handleWebhook()` — ACID transaction: payment→SUCCESS, registration→CONFIRMED, ticket→ACTIVE, DEL seat lock, fire PAYMENT_SUCCESS event
- [x] 5.3 Implement `PaymentsService.handleWebhook()` failure path — payment→FAILED, release seat lock, INCR seat counter, fire PAYMENT_FAILED event
- [x] 5.4 Implement `PaymentsService.getMyPayments()` — delegate to repository with IDOR enforcement
- [x] 5.5 Implement `PaymentsService.getPaymentDetail()` — find by ID with ownership verification
- [x] 5.6 Implement `PaymentsService.expirePayment()` — ACID transaction: payment→TIMEOUT, registration→CANCELLED, INCR seat counter, DEL seat lock, fire PAYMENT_FAILED event (W4 contract)

## 6. Presentation — Payments Controller

- [x] 6.1 Wire `POST /payments` — inject validated CreatePaymentDto, extract idempotency key, call initiate(), return CreatePaymentResponseDto
- [x] 6.2 Wire `POST /webhooks/payment/:gateway` — inject validated PaymentWebhookDto, apply public + HmacSignatureGuard, call handleWebhook()
- [x] 6.3 Wire `GET /students/me/payments` — call getMyPayments() with JWT user, return paginated PaymentResponseDto list
- [x] 6.4 Wire `GET /students/me/payments/:id` — call getPaymentDetail() with JWT user and path param, return PaymentResponseDto

## 7. Module Integration

- [x] 7.1 Add `SharedQueueModule` to `BookingModule.imports` for BullMQ notification queue injection
- [x] 7.2 Add `@InjectQueue(NOTIFICATION_QUEUE)` injection in `PaymentsService` for event emission
- [x] 7.3 Run `pnpm check-types` and `pnpm lint --filter=server` to verify no build errors
