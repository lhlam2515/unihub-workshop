/**
 * Idempotency Mechanic
 *
 * Layer 1 chống double-charge.
 * check(idempotencyKey): SET NX idempotency:{key} EX 86400.
 * Nếu key đã tồn tại (SET NX trả null) → GET để lấy payment_id cũ → trả PAYMENT_DUPLICATE.
 * Nếu chưa: set placeholder, trả proceed: true.
 * setPaymentId(key, paymentId): update giá trị sau khi tạo payment thành công.
 */

import { Injectable } from "@nestjs/common";
import { RedisService } from "@shared/redis/redis.service";

@Injectable()
export class IdempotencyMechanic {
  constructor(private readonly redisService: RedisService) {}

  /**
   * check(idempotencyKey: string): Promise<Result<{ proceed: boolean, existingPaymentId?: string }>>
   *
   * TODO: Check idempotency
   * 1. Try SET NX idempotency:{key}
   * 2. If already exists, GET and return existing payment_id
   * 3. If new, set placeholder and allow proceed
   */
  async check(idempotencyKey: string) {
    // TODO: Implement
  }

  /**
   * setPaymentId(idempotencyKey: string, paymentId: string): Promise<void>
   *
   * TODO: Update with actual payment ID after successful creation
   */
  async setPaymentId(idempotencyKey: string, paymentId: string) {
    // TODO: Implement
  }
}
