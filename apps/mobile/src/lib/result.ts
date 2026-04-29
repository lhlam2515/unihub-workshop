/**
 * Typed Result object used across service boundaries.
 *
 * `T` = success payload type.
 * `E` = error payload type (defaults to unknown to align with handleError).
 *
 * Mobile additions over the web version:
 *  - `Result.fromThrowable()` — wraps a synchronous function that may throw
 *    (useful for JSON.parse, SQLite reads, crypto operations, etc.)
 */
export class Result<T, E = unknown> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _data?: T;
  private readonly _error?: E;

  /**
   * Private constructor to enforce the use of static factory methods (`ok` and `fail`).
   *
   * @param isSuccess - Indicates whether the operation was successful.
   * @param error - The error payload if the operation failed.
   * @param data - The resulting data if the operation succeeded.
   */
  private constructor(isSuccess: boolean, error?: E, data?: T) {
    if (isSuccess && error) {
      throw new Error(
        "InvalidOperation: A result cannot be successful and contain an error"
      );
    }
    if (!isSuccess && !error) {
      throw new Error(
        "InvalidOperation: A failing result needs to contain an error message"
      );
    }

    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._data = data;
    this._error = error;
  }

  /**
   * Retrieves the successful data.
   * Throws an error if called on a failed result to ensure strict type safety.
   *
   * @returns The data payload.
   * @throws {Error} If the result is a failure.
   */
  public get data(): T {
    if (!this.isSuccess) {
      throw new Error(
        "Can't get the value of an error result. Use 'error' instead."
      );
    }
    return this._data as T;
  }

  /**
   * Retrieves the error payload.
   *
   * @returns The error details.
   * @throws {Error} If the result is a success.
   */
  public get error(): E {
    if (!this.isFailure) {
      throw new Error(
        "Can't get the error of a success result. Use 'data' instead."
      );
    }
    return this._error as E;
  }

  /**
   * Creates a successful Result instance.
   *
   * @template U - The type of the success data.
   * @param data - The data to return.
   * @returns A successful Result object.
   */
  public static ok<U, F = never>(data?: U): Result<U, F> {
    return new Result<U, F>(true, undefined, data);
  }

  /**
   * Creates a failed Result instance.
   *
   * @template U - The type of the expected success data
   * @param error - The error payload.
   * @returns A failed Result object.
   */
  public static fail<U, F = unknown>(error: F): Result<U, F> {
    return new Result<U, F>(false, error);
  }

  /**
   * Wrap a Promise and convert thrown exceptions into `Result.fail`.
   *
   * @example
   * ```ts
   * const result = await Result.fromPromise(api.get('/workshops/123'));
   * if (result.isFailure) {
   *   const appError = handleError(result.error);
   *   toast.error(appError.title);
   *   return;
   * }
   * setWorkshop(result.data);
   * ```
   */
  public static async fromPromise<U, F = unknown>(
    promise: Promise<U>,
    mapError?: (error: unknown) => F
  ): Promise<Result<U, F>> {
    try {
      return Result.ok<U, F>(await promise);
    } catch (error) {
      return Result.fail<U, F>(mapError ? mapError(error) : (error as F));
    }
  }

  /**
   * Wrap a synchronous function that may throw and convert exceptions into `Result.fail`.
   *
   * Useful on mobile for operations like `JSON.parse`, SQLite reads, or any
   * synchronous computation that can throw without async overhead.
   *
   * @example
   * ```ts
   * const result = Result.fromThrowable(() => JSON.parse(rawString));
   * if (result.isFailure) {
   *   logger.warn('Failed to parse stored data', result.error);
   *   return;
   * }
   * setConfig(result.data);
   * ```
   */
  public static fromThrowable<U, F = unknown>(
    fn: () => U,
    mapError?: (error: unknown) => F
  ): Result<U, F> {
    try {
      return Result.ok<U, F>(fn());
    } catch (error) {
      return Result.fail<U, F>(mapError ? mapError(error) : (error as F));
    }
  }
}
