import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import * as schema from "./schema";

// ── Constants ───────────────────────────────────────────────
export const DATABASE_NAME = "unihub.db";

// ── Database Instance ───────────────────────────────────────
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function createDatabaseClient() {
  if (dbInstance) {
    return dbInstance;
  }

  const expoDb = openDatabaseSync(DATABASE_NAME);

  // Enable WAL mode for better concurrent read/write performance.
  // Critical for offline check-in: camera scan writes + sync worker reads
  // can happen simultaneously without blocking each other.
  expoDb.execSync("PRAGMA journal_mode = WAL;");

  dbInstance = drizzle(expoDb, { schema });
  return dbInstance;
}

// ── Type Export ─────────────────────────────────────────────
export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
