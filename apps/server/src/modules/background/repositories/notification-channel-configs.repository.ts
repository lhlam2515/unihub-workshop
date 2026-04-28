import {
  DATABASE_CONNECTION,
  DATABASE_SCHEMA,
  type DatabaseClient,
  type DatabaseSchema,
} from '@database';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

/**
 * NotificationChannelConfigsRepository
 *
 * CRUD operations for notification channel configurations.
 * Stores channel-specific settings: email SMTP, Telegram bot token, etc.
 *
 * Methods:
 * - findAll() → List all channel configs
 * - findByChannelType(type) → Get single channel config
 * - update(channelType, data) → Update channel config
 *
 * Note: Data is relatively static and can be cached in memory.
 *
 * TODO: Implement all methods using Drizzle ORM
 */
@Injectable()
export class NotificationChannelConfigsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema
  ) {}

  // TODO: Implement findAll
  async findAll(): Promise<any[]> {
    // Query notification_channel_configs table
    // Return all channel configs with fields:
    // - channel_type: 'EMAIL' | 'TELEGRAM'
    // - is_active: boolean
    // - config_json: JSON with provider-specific settings
    // - updated_at: DateTime
  }

  // TODO: Implement findByChannelType
  async findByChannelType(channelType: string): Promise<any | null> {
    // Query notification_channel_configs WHERE channel_type = channelType
    // Return config or null
  }

  // TODO: Implement update
  async update(channelType: string, data: any): Promise<any> {
    // Update notification_channel_configs SET is_active, config_json, updated_at
    // Fields from data:
    //   - is_active: boolean
    //   - config_json?: object (provider-specific settings)
    // Return updated record
  }
}
