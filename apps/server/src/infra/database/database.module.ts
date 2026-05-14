import { Pool } from "@neondatabase/serverless";
import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/neon-serverless";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "./database.constants";
import * as schema from "./schema";

import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export const DATABASE_POOL = "DATABASE_POOL";

const poolProvider = {
  provide: DATABASE_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Pool({
      connectionString: config.getOrThrow<string>("database.url"),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  },
};

const databaseConnectionProvider = {
  provide: DATABASE_CONNECTION,
  inject: [DATABASE_POOL],
  useFactory: (pool: Pool) => {
    return drizzle({ client: pool, schema });
  },
};

export type DatabaseClient = NeonDatabase<typeof schema>;
export type DatabaseSchema = typeof schema;

const databaseSchemaProvider = {
  provide: DATABASE_SCHEMA,
  useValue: schema,
};

@Global()
@Module({
  providers: [poolProvider, databaseConnectionProvider, databaseSchemaProvider],
  exports: [DATABASE_CONNECTION, DATABASE_SCHEMA],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}
