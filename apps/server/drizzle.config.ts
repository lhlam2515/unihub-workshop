import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_MIGRATION_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_MIGRATION_URL environment variable is not set");
}

export default defineConfig({
  schema: "./src/database/schema/*.schema.ts",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
