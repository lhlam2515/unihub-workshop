/**
 * AiSummariesRepository (Background Module)
 *
 * Note: This repository is shared with the Catalog module.
 * To avoid duplication, import and re-export from CatalogModule:
 *
 * // In background.module.ts
 * imports: [
 *   // ... other imports
 *   CatalogModule,
 * ],
 * // Then inject it directly from CatalogModule
 * constructor(private readonly aiSummariesRepo: AiSummariesRepository) {}
 *
 * Alternative: Create this as an alias/extension if additional
 * background-specific methods are needed.
 *
 * Methods (shared with Catalog):
 * - findByDocumentId(id) → Get summary for document
 * - upsert(documentId, workshopId, data) → Insert or update
 * - updateStatus(id, status, summaryText?) → Update summary status
 *
 * Location: src/modules/catalog/repositories/ai-summaries.repository.ts
 */
