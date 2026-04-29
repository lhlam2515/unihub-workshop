import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/database/schema/*.schema.ts",
  out: "./src/lib/database/migrations",
  dialect: "sqlite",
  driver: "expo",
});
