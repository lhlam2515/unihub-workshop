/**
 * DrizzleTransaction type
 *
 * Inferred transaction context type from the DatabaseClient.
 * Used to replace `tx?: any` in repository methods that support
 * optional Drizzle transaction context, eliminating no-unsafe-* ESLint errors.
 *
 * Resolves to PgTransaction<NeonHttpQueryResultHKT, DatabaseSchema, ExtractTablesWithRelations<DatabaseSchema>>.
 */
import type { DatabaseClient } from "@/database";

export type DrizzleTransaction = Parameters<
  DatabaseClient["transaction"]
>[0] extends (tx: infer T) => unknown
  ? T
  : never;
