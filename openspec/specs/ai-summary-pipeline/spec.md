# ai-summary-pipeline Specification

## Purpose
TBD - created by archiving change ai-summary-pipeline. Update Purpose after archive.
## Requirements
### Requirement: AI-SUMMARY-001 — Document Processing Pipeline
The system SHALL process a document through a 5-stage pipeline: upsert record, extract text, clean text, generate summary via LLM, save result.

#### Scenario: Successful full pipeline execution
- **WHEN** a document is queued for summarization
- **THEN** the pipeline extracts text, generates a summary, and saves the result with status `DONE`

#### Scenario: Upsert before processing
- **WHEN** a document is submitted for summarization
- **THEN** the system SHALL upsert a `PENDING` record in `ai_summaries` before processing

### Requirement: AI-SUMMARY-002 — LLM Timeout Handling
The system SHALL impose a 40-second timeout on the LLM call stage.

#### Scenario: LLM timeout results in FAILED status
- **WHEN** the LLM call exceeds 40 seconds
- **THEN** the summary status SHALL be set to `FAILED` with error message `LLM_TIMEOUT`
- **AND** the job SHALL NOT be retried

### Requirement: AI-SUMMARY-003 — Worker Retry on Transient Errors
The system SHALL retry failed jobs up to 3 times with exponential backoff.

#### Scenario: Transient errors trigger retry
- **WHEN** a non-timeout error occurs during processing
- **THEN** the job SHALL be retried up to 3 times with exponential backoff starting at 10s

#### Scenario: All retries exhausted
- **WHEN** all 3 retry attempts fail
- **THEN** the summary status SHALL be set to `FAILED` with the original error message

### Requirement: AI-SUMMARY-004 — Text Cleaning
The system SHALL clean extracted text before sending to the LLM.

#### Scenario: Whitespace normalization
- **WHEN** extracted text contains extra whitespace or irregular newlines
- **THEN** the text SHALL be normalized (single spaces, consistent newlines)

#### Scenario: Text truncation
- **WHEN** extracted text exceeds 8000 characters
- **THEN** the text SHALL be truncated to 8000 characters

### Requirement: AI-SUMMARY-005 — Worker Queue Configuration
The worker SHALL consume from the `AI_SUMMARY_QUEUE` queue.

#### Scenario: Worker processes queue jobs
- **WHEN** a job is added to `AI_SUMMARY_QUEUE`
- **THEN** the worker SHALL pick it up and invoke `processDocument`

