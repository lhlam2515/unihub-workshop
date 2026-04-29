/**
 * Payments Repository
 *
 * CRUD trên bảng payments.
 * Methods:
 * - findByIdempotencyKey(key) — Layer 2 idempotency (UNIQUE constraint)
 * - create(data, tx?)
 * - updateStatus(id, status, gatewayTxnId?, tx?)
 * - findMyPayments(studentId, pagination)
 * - findPendingOverdue() — cho payment timeout cron
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@database";
import { Injectable, Inject } from "@nestjs/common";

import type { DatabaseClient, DatabaseSchema } from "@database";

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findByIdempotencyKey(key)
   * TODO: Implement
   */
  async findByIdempotencyKey(key: string) {
    // TODO: Layer 2 idempotency check
  }

  /**
   * create(data, tx?)
   * TODO: Implement
   */
  async create(data: any, tx?: any) {
    // TODO: Implement
  }

  /**
   * updateStatus(id, status, gatewayTxnId?, tx?)
   * TODO: Implement
   */
  async updateStatus(
    id: string,
    status: string,
    gatewayTxnId?: string,
    tx?: any
  ) {
    // TODO: Implement
  }

  /**
   * findMyPayments(studentId, pagination?)
   * TODO: Implement
   */
  async findMyPayments(studentId: string, pagination?: any) {
    // TODO: Implement
  }

  /**
   * findPendingOverdue()
   * TODO: Implement
   */
  async findPendingOverdue() {
    // TODO: Implement — find payments older than deadline
  }
}
