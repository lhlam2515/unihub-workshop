/**
 * Users Repository
 *
 * CRUD trên bảng users.
 * Methods:
 * - findById(id)
 * - findByEmail(email) — has index idx_users_email
 * - updateStatus(id, status)
 *
 * @see DatabaseModule for DATABASE_CONNECTION
 */

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from '@database';
import { Injectable, Inject } from '@nestjs/common';

import type { DatabaseClient, DatabaseSchema } from '@database';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * findById(id: string): Promise<User | null>
   */
  async findById(id: string) {
    // TODO: Query users table WHERE id = ?
    // Return user entity or null
  }

  /**
   * findByEmail(email: string): Promise<User | null>
   * Uses index: idx_users_email
   */
  async findByEmail(email: string) {
    // TODO: Query users table WHERE email = ?
    // Used in login flow
  }

  /**
   * create(data: any, tx?: Transaction): Promise<User>
   */
  async create(data: any, tx?: any) {
    // TODO: Insert new user into users table
  }

  /**
   * updateStatus(id: string, status: string): Promise<User>
   */
  async updateStatus(id: string, status: string) {
    // TODO: Update user status
  }
}
