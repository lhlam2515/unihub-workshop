/**
 * Storage Module
 *
 * Global dynamic module that provides {@link StorageService}. Imported once
 * in `AppModule` via `StorageModule.forRoot(config)`. The `@Global()` decorator
 * makes `StorageService` injectable in every feature module without explicit
 * imports.
 *
 * Design rationale:
 * - A dynamic `forRoot()` pattern allows the consumer (`AppModule`) to
 *   supply environment-specific configuration (endpoint, credentials, bucket).
 * - Validation is performed at module initialization time (fail-fast): if a
 *   required environment variable is missing the application crashes on startup
 *   rather than at the first upload request.
 *
 * Side effects: Registers StorageService as a global provider.
 */
import { Global, Module, DynamicModule } from "@nestjs/common";

import { STORAGE_CONFIG } from "./storage.constants";
import { StorageService } from "./storage.service";

import type { StorageConfig } from "./storage.config";

@Global()
@Module({})
export class StorageModule {
  /**
   * Registers the StorageModule with the provided configuration.
   *
   * Validates that all required config fields are present at registration
   * time. If any field is missing or empty the application fails fast with
   * a descriptive error.
   *
   * @param config - Fully resolved storage configuration.
   * @returns A dynamic module with StorageService registered as a provider.
   */
  static forRoot(config: StorageConfig): DynamicModule {
    const resolvedConfig = {
      ...config,
      region: config.region ?? "auto",
      maxFileSizeBytes: config.maxFileSizeBytes ?? 52_428_800,
    };

    const missingFields: string[] = [];

    if (!resolvedConfig.endpoint) missingFields.push("endpoint");
    if (!resolvedConfig.accessKeyId) missingFields.push("accessKeyId");
    if (!resolvedConfig.secretAccessKey) missingFields.push("secretAccessKey");
    if (!resolvedConfig.bucketName) missingFields.push("bucketName");
    if (!resolvedConfig.publicUrl) missingFields.push("publicUrl");

    if (missingFields.length > 0) {
      throw new Error(
        `StorageModule configuration is incomplete. Missing required fields: ${missingFields.join(", ")}. ` +
          "Ensure R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, " +
          "and R2_PUBLIC_URL environment variables are set."
      );
    }

    return {
      module: StorageModule,
      providers: [
        { provide: STORAGE_CONFIG, useValue: resolvedConfig },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}
