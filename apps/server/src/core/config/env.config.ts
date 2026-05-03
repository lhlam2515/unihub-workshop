/**
 * Environment Configuration
 *
 * Centralized, validated environment variable access using @nestjs/config.
 * All env vars used across the application are defined here in a single
 * Zod schema — enabling fail-fast on misconfiguration at startup.
 *
 * Usage from DI container:
 *   - Namespaced: `@Inject(jwtConfig.KEY) private config: ConfigType<typeof jwtConfig>`
 *   - Generic:    `this.configService.get<string>("jwt.secret")`
 *
 * Usage from main.ts (outside DI):
 *   - `app.get(ConfigService).get<number>("app.port")`
 */
import { registerAs } from "@nestjs/config";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().url({ message: "DATABASE_URL is required" }),

  // Redis
  REDIS_URL: z.string().url({ message: "REDIS_URL is required" }),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // R2 / Storage
  R2_ENDPOINT: z.string(),
  R2_REGION: z.string().default("auto"),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z
    .string()
    .url({ message: "R2_PUBLIC_URL must be a valid URL" }),
  UPLOAD_MAX_FILE_SIZE: z.coerce.number().default(52_428_800),

  // Payment Gateway
  PAYMENT_GATEWAY_SECRETS: z.string().optional(),

  // Logging
  LOG_LEVEL: z.string().default("info"),

  // CORS
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates the raw environment object at module initialization time.
 *
 * Called by `ConfigModule.forRoot({ validate })` — runs before any provider
 * is instantiated. If validation fails the application crashes with a
 * descriptive error message listing ALL missing or malformed variables.
 *
 * @param config - Raw key-value pairs from process.env / .env file.
 * @returns The validated and coerced environment configuration.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Environment validation failed. Check .env or environment variables:\n${issues}`
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Namespaced Configurations (for type-safe injection)
// ---------------------------------------------------------------------------

export const appConfig = registerAs("app", () => ({
  port: parseInt(process.env.PORT!, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
}));

export const jwtConfig = registerAs("jwt", () => ({
  secret: process.env.JWT_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  accessExpiry: { WEB: 900, MOBILE: 28800 } as const,
  refreshExpiry: 604_800,
}));

export const dbConfig = registerAs("database", () => ({
  url: process.env.DATABASE_URL!,
}));

export const redisConfig = registerAs("redis", () => ({
  url: process.env.REDIS_URL!,
}));

export const r2Config = registerAs("r2", () => ({
  endpoint: process.env.R2_ENDPOINT!,
  region: process.env.R2_REGION ?? "auto",
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucketName: process.env.R2_BUCKET_NAME!,
  publicUrl: process.env.R2_PUBLIC_URL!,
  maxFileSizeBytes: parseInt(
    process.env.UPLOAD_MAX_FILE_SIZE ?? "52428800",
    10
  ),
}));

export const paymentConfig = registerAs("payment", () => ({
  gatewaySecrets: process.env.PAYMENT_GATEWAY_SECRETS,
}));

export const loggingConfig = registerAs("logging", () => ({
  level: process.env.LOG_LEVEL || "info",
}));

export const corsConfig = registerAs("cors", () => ({
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
}));
