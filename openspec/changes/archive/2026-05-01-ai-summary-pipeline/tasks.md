## 1. Create OpenSpec Artifacts

- [x] 1.1 Create proposal.md
- [x] 1.2 Create design.md
- [x] 1.3 Create specs/ai-summary-pipeline/spec.md
- [x] 1.4 Create tasks.md

## 2. Implement AiSummaryService

- [x] 2.1 Implement `processDocument()` pipeline with all 5 stages
- [x] 2.2 Implement `extractTextFromPdf()` helper (mock)
- [x] 2.3 Implement `cleanAndNormalizeText()` helper
- [x] 2.4 Implement `callClaudeApi()` helper (mock)
- [x] 2.5 Error handling: LLM timeout → FAILED, other errors → propagate

## 3. Implement AiSummaryWorker

- [x] 3.1 Add `@Processor(AI_SUMMARY_QUEUE)` decorator
- [x] 3.2 Add `@Process()` handler with timeout wrapper
- [x] 3.3 Implement `withTimeout()` helper using Promise.race

## 4. Configure Queue

- [x] 4.1 Add defaultJobOptions to AI_SUMMARY_QUEUE (3 attempts, exponential backoff)

## 5. Verification

- [x] 5.1 `pnpm check-types` passes
- [x] 5.2 `pnpm build --filter=server` passes
