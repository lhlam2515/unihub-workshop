# AI Summary Tracking

Purpose: Track AI-generated workshop content summaries through their lifecycle (PENDING → PROCESSING → DONE/FAILED) and expose appropriate levels of detail to public and admin users.

## ADDED Requirements

### Requirement: AI summary created on document upload
The system SHALL automatically create an AI summary record with status PENDING when a document is uploaded. The actual AI processing is handled by the Background module via job queue.

#### Scenario: Summary record created
- **WHEN** a document is successfully uploaded
- **THEN** an ai_summaries record is created with status = PENDING, linked to the document and workshop

#### Scenario: One summary per document
- **WHEN** attempting to create a second summary for the same document
- **THEN** DB unique constraint on document_id prevents duplicates

### Requirement: Public can view AI summary for a workshop
The system SHALL expose AI summary content to public users when the summary status is DONE.

#### Scenario: Summary available
- **WHEN** a user requests workshop detail and the workshop has an AI summary with status DONE
- **THEN** the WorkshopDetailDto includes ai_summary with summary_text, model_used, generated_at

#### Scenario: Summary pending or processing
- **WHEN** a user requests workshop detail and the AI summary status is PENDING or PROCESSING
- **THEN** the WorkshopDetailDto includes ai_summary with status but no summary_text

#### Scenario: No summary exists
- **WHEN** a user requests workshop detail and no AI summary exists for the workshop
- **THEN** the WorkshopDetailDto has no ai_summary field (undefined)

### Requirement: Admin can view full AI summary details
The system SHALL allow ORGANIZER to view full AI summary details including error_message for debugging.

#### Scenario: Admin view with error
- **WHEN** ORGANIZER requests admin workshop detail and the AI summary status is FAILED
- **THEN** the admin detail includes ai_summary with status, error_message, document_id for debugging

### Requirement: Admin can retry failed AI summary
The system SHALL allow ORGANIZER to re-trigger AI summary processing for a document whose status is FAILED.

#### Scenario: Retry failed summary
- **WHEN** ORGANIZER calls POST /admin/workshops/{id}/documents/{documentId}/retry-summary
- **THEN** system updates ai_summaries status to PENDING (triggering Background module to pick it up) and returns OkResult

#### Scenario: Retry non-failed summary
- **WHEN** ORGANIZER attempts to retry a summary that is not FAILED
- **THEN** system returns FailResult with BUSINESS error
