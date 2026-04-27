import { neon } from '@neondatabase/serverless';
import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/neon-http';

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from './database.constants';
import * as schema from './schema';

const databaseConnectionProvider = {
  provide: DATABASE_CONNECTION,
  useFactory: () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    return drizzle({ client: neon(databaseUrl), schema });
  },
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
