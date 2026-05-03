import type { Result } from "@/shared/response/result";

/**
 * Contract for a single processing stage in a Pipe-and-Filter architecture.
 *
 * Each filter is an independent, stateless processing unit that:
 * - Takes typed input and produces typed output (both wrapped in Result).
 * - Has no knowledge of surrounding filters (predecessor or successor).
 * - Is independently testable and swappable.
 *
 * Filters are composed by a Pipeline orchestrator which connects the output
 * of one filter to the input of the next via typed function calls — the
 * "Pipe" in Pipe-and-Filter.
 *
 * @typeParam TInput - The shape this filter expects as input.
 * @typeParam TOutput - The shape this filter produces as output.
 *   Typically a subset of PipelineContext fields.
 */
export interface IPipelineFilter<TInput, TOutput> {
  /** Human-readable name used for logging and diagnostics. */
  readonly name: string;

  /**
   * Transforms the input and returns a result.
   *
   * Business rules:
   * - Returns OkResult on success with the transformed output.
   * - Returns FailResult on failure with an AppError — the pipeline
   *   orchestrator short-circuits on the first failure.
   * - Must NOT throw exceptions — all error paths return Result.fail().
   *
   * @param input - Typed input data for this filter stage.
   * @returns OkResult containing the transformed output, or FailResult.
   */
  process(input: TInput): Promise<Result<TOutput>>;
}
