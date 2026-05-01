# Proposal: AI Summary Pipeline

## Why

Workshop documents (PDFs) need to be automatically summarized so students can quickly assess workshop content without reading full documents. Manual summarization doesn't scale.

## What Changes

- Implement `AiSummaryService` with a 5-stage pipe-and-filter pipeline: upsert → text extraction → cleaning → LLM call → save result
- Implement `AiSummaryWorker` as a BullMQ consumer for `AI_SUMMARY_QUEUE` with timeout handling
- Configure `AI_SUMMARY_QUEUE` with 3 retry attempts and exponential backoff

## Capabilities

- **New:** `ai-summary-pipeline/spec.md` — AI document summarization pipeline

## Impact

- `apps/server/src/modules/background/services/ai-summary.service.ts` — full implementation
- `apps/server/src/modules/background/workers/ai-summary.worker.ts` — full implementation
- `apps/server/src/shared/queues/queue.module.ts` — add AI_SUMMARY_QUEUE default job options
