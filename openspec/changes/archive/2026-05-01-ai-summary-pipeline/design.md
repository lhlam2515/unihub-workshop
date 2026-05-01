# Design: AI Summary Pipeline

## Context

Documents are uploaded to object storage via the Catalog module. When a document is uploaded, an `AiSummary` record is created with status `PENDING` by `AiSummariesRepository.upsert()`. A BullMQ job is enqueued to `AI_SUMMARY_QUEUE` for async processing.

## Goals

- Extract text from PDF documents stored in object storage
- Generate summaries using Claude API
- Handle timeouts and retries gracefully
- Store results in `ai_summaries` table

## Non-Goals

- Real PDF text extraction (MVP uses placeholder; `pdf-parse` integration is follow-up)
- Real Claude API integration (MVP uses placeholder; Anthropic SDK is follow-up)
- Document upload flow (handled by Catalog module)

## Decisions

1. **Pipe-and-Filter pattern**: Each pipeline stage is a separate private method, making stages testable and replaceable independently.
2. **40s timeout with `Promise.race`**: LLM calls can hang indefinitely. A race-based timeout ensures the worker doesn't get stuck. 40s = 30s LLM budget + 10s buffer for text extraction.
3. **LLM_TIMEOUT as terminal failure**: If the LLM times out, retrying is unlikely to help (same payload). Mark as FAILED immediately.
4. **BullMQ built-in retry for other failures**: Transient errors (DB connection, network) get 3 attempts with exponential backoff (10s, 20s, 40s) via BullMQ config.
5. **Mock-first approach**: PDF extraction and LLM calls return placeholder results. Real implementations can be swapped in without changing the pipeline structure.

## Risks

- **Risk: Large PDFs exceeding 8000 chars** → Mitigation: Truncate in the cleaning stage.
- **Risk: LLM API rate limiting** → Mitigation: Each document is processed sequentially; queue concurrency = 1.
