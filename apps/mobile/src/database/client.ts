import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import * as schema from "./schema";

// ── Constants ───────────────────────────────────────────────
export const DATABASE_NAME = "unihub.db";

// ── Database Instance ───────────────────────────────────────
const expoDb = openDatabaseSync(DATABASE_NAME);

// Enable WAL mode for better concurrent read/write performance.
// Critical for offline check-in: camera scan writes + sync worker reads
// can happen simultaneously without blocking each other.
expoDb.execSync("PRAGMA journal_mode = WAL;");

export const db = drizzle(expoDb, { schema });

// ── Type Export ─────────────────────────────────────────────
export type DatabaseClient = typeof db;
