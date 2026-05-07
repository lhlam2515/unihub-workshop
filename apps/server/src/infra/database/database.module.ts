import { neon } from "@neondatabase/serverless";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/neon-http";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "./database.constants";
import * as schema from "./schema";

import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

const databaseConnectionProvider = {
  provide: DATABASE_CONNECTION,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.getOrThrow<string>("database.url");
    return drizzle({ client: neon(url), schema });
  },
};

export type DatabaseClient = NeonHttpDatabase<typeof schema>;
export type DatabaseSchema = typeof schema;
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
