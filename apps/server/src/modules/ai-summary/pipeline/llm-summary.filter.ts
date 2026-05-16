import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { aiSummaryErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import type { PdfPipelineContext } from "./pipeline-context";
import type { IPipelineFilter } from "./pipeline-filter.interface";

/**
 * Stage 4 filter: Generates a workshop content summary by sending the cleaned
 * document text to the DeepSeek API via the Anthropic SDK.
 *
 * Input fields read from context: `cleanedText`
 * Output fields written to context: `summaryText`, `modelUsed`
 *
 * Architecture note:
 * Uses @anthropic-ai/sdk configured with baseURL = https://api.deepseek.com/anthropic
 * DeepSeek is API-compatible with Anthropic's Messages API, so no separate SDK is
 * needed. This leverages the third-party SDK adapter pattern documented in
 * third_party_sdk_patterns.
 *
 * Business rules:
 * - The model is configurable via AI_SUMMARY_MODEL env var (default: deepseek-v4-pro).
 * - The API key is sourced from DEEPSEEK_API_KEY env var.
 * - A summarisation system prompt guides the model to produce concise, structured
 *   summaries suitable for workshop attendees and administrators.
 * - The LLM call is wrapped in Result.fail() — errors propagate to the pipeline
 *   orchestrator rather than throwing.
 *
 * Side effects:
 * - Makes an HTTPS request to api.deepseek.com.
 */
@Injectable()
export class LlmSummaryFilter implements IPipelineFilter<
  PdfPipelineContext,
  PdfPipelineContext
> {
  private readonly logger = new Logger(LlmSummaryFilter.name);
  private readonly anthropic?: Anthropic;
  private readonly model: string;

  readonly name = "LlmSummary";

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("ai.deepseekApiKey");
    this.model = configService.get<string>(
      "ai.summaryModel",
      "deepseek-v4-pro"
    );
    const baseURL = configService.get<string>(
      "ai.baseUrl",
      "https://api.deepseek.com/anthropic"
    );

    if (apiKey) {
      // Set SDK timeout to 35s — slightly below the worker's 40s Promise.race so the
      // SDK cancels the request before the outer timer fires, giving a cleaner error path.
      this.anthropic = new Anthropic({ apiKey, baseURL, timeout: 35_000 });
      this.logger.log(
        `LLM summary filter initialised with model: ${this.model}`
      );
    } else {
      this.logger.warn(
        "LLM summary filter disabled because ai.deepseekApiKey is not configured"
      );
    }
  }

  async process(
    context: PdfPipelineContext
  ): Promise<Result<PdfPipelineContext>> {
    if (!context.cleanedText) {
      this.logger.warn(
        "No cleaned text to summarise — returning empty summary"
      );
      return Result.ok({
        ...context,
        summaryText: "",
        modelUsed: this.model,
      });
    }

    this.logger.log(
      `Generating summary via ${this.model} (${context.cleanedText.length} chars)`
    );

    if (!this.anthropic) {
      return Result.fail(
        aiSummaryErrors.llmApiError(
          this.model,
          "DeepSeek API key is not configured"
        )
      );
    }

    try {
      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        system:
          "You are a workshop content summariser for a university platform. " +
          "Summarise the following workshop document in Vietnamese, focusing on: " +
          "key topics covered, practical examples, and learning outcomes. " +
          "Format the summary as a concise paragraph of 3-5 sentences. " +
          "Use clear, academic-style Vietnamese.",
        messages: [
          {
            role: "user",
            content: `Please summarise the following workshop document:\n\n${context.cleanedText}`,
          },
        ],
      });

      const summaryText =
        message.content[0]?.type === "text" ? message.content[0].text : "";

      this.logger.log(`Summary generated: ${summaryText.length} characters`);

      return Result.ok({
        ...context,
        summaryText,
        modelUsed: this.model,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Distinguish timeout from other API errors
      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("TIMEOUT") ||
        errorMessage.includes("timed out")
      ) {
        this.logger.warn(
          `LLM request timed out for document ${context.documentId}`
        );
        return Result.fail(aiSummaryErrors.llmTimeout(this.model));
      }

      this.logger.error(
        `LLM API error for document ${context.documentId}: ${errorMessage}`
      );
      return Result.fail(aiSummaryErrors.llmApiError(this.model, error));
    }
  }
}
