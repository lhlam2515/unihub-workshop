import { neon } from '@neondatabase/serverless';
import { Global, Module } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-http';

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from './database.constants';
import * as schema from './schema';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const db = drizzle({ client: neon(DATABASE_URL), schema });
export type Database = typeof db;

const databaseConnectionProvider = {
  provide: DATABASE_CONNECTION,
  useValue: db,
};

const databaseSchemaProvider = {
  provide: DATABASE_SCHEMA,
  useValue: schema,
};

@Global()
@Module({
  providers: [databaseConnectionProvider, databaseSchemaProvider],
  exports: [DATABASE_CONNECTION, DATABASE_SCHEMA],
})
export class DatabaseModule {}
