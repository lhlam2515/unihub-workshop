# Document Upload

Purpose: Upload PDF documents to object storage for workshops, track upload status, and trigger AI-powered summarization pipeline.

## ADDED Requirements

### Requirement: Organizer uploads PDF document for a workshop
The system SHALL allow ORGANIZER to upload a PDF document associated with a workshop. The document SHALL be stored externally (object storage) with only the URL persisted in the database.

#### Scenario: Upload document
- **WHEN** ORGANIZER uploads a PDF for a workshop with original_name and file_size_bytes
- **THEN** system stores the file URL, creates a workshop_documents record with upload_status = UPLOADED, creates an ai_summaries record with status = PENDING, and returns WorkshopDocumentResponseDto

#### Scenario: Upload to non-existent workshop
- **WHEN** ORGANIZER attempts to upload a document for a workshop that does not exist
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND

### Requirement: Organizer lists documents for a workshop
The system SHALL allow ORGANIZER to list all documents associated with a workshop.

#### Scenario: List documents
- **WHEN** ORGANIZER requests GET /admin/workshops/{id}/documents
- **THEN** system returns array of WorkshopDocumentResponseDto sorted by uploaded_at descending

#### Scenario: Empty document list
- **WHEN** ORGANIZER requests documents for a workshop with no uploads
- **THEN** system returns empty array

### Requirement: Organizer deletes a document
The system SHALL allow ORGANIZER to delete a document and its associated AI summary.

#### Scenario: Delete document
- **WHEN** ORGANIZER calls DELETE /admin/workshops/{id}/documents/{documentId}
- **THEN** system deletes the document record (CASCADE deletes ai_summaries) and returns OkResult

#### Scenario: Delete non-existent document
- **WHEN** ORGANIZER attempts to delete a document that does not exist
- **THEN** system returns FailResult with NOT_FOUND error
