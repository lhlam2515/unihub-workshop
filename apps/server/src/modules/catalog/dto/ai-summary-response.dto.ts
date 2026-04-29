/**
 * AI Summary Response DTOs
 *
 * Two shapes:
 * - AiSummaryPublicDto: { status, summary_text, model_used, generated_at }
 * - AiSummaryAdminDto: extends with summary_id, document_id, error_message
 */

export interface AiSummaryPublicDto {
  status: string;
  summary_text?: string;
  model_used?: string;
  generated_at?: Date;
}

export interface AiSummaryAdminDto extends AiSummaryPublicDto {
  summary_id: string;
  document_id: string;
  error_message?: string;
}

export class AiSummaryResponseBuilder {
  static fromPublic(summary: any): AiSummaryPublicDto {
    // TODO: Map to public shape
    return {
      status: "",
    };
  }

  static fromAdmin(summary: any): AiSummaryAdminDto {
    // TODO: Map to admin shape
    return {
      status: "",
      summary_id: "",
      document_id: "",
    };
  }
}
