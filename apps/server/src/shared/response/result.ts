import type { AppError } from './types';

/**
 * Model success and failure without throwing
 *
 * Business rules:
 * - Consumers must branch on `isSuccess` / `isFailure` before accessing data
 * - Errors are carried as values rather than exceptions
 */
export abstract class Result<T> {
  /** Indicate whether the result represents success. */
  public abstract readonly isSuccess: boolean;

  /** Provide the inverse of `isSuccess` for readability. */
  public get isFailure(): boolean {
    return !this.isSuccess;
  }

  /**
   * Access the success payload
   *
   * @returns Success data when the result is successful
   * @throws Error when accessed on a failed result
   */
  public abstract get data(): T;

  /**
   * Access the failure payload
   *
   * @returns Error payload when the result is a failure
   * @throws Error when accessed on a successful result
   */
  public abstract get error(): AppError;

  /**
   * Create a successful result with a payload
   *
   * @param data - Payload returned to callers
   * @returns Successful result wrapper
   * @throws Never. Returns a result object instead of throwing
   */
  public static ok<U>(data: U): OkResult<U>;
  /**
   * Create a successful result without a payload
   *
   * @returns Successful result wrapper
   * @throws Never. Returns a result object instead of throwing
   */
  public static ok(): OkResult<void>;
  public static ok<U>(data?: U): OkResult<U | void> {
    return new OkResult(data as U);
  }

  /**
   * Create a failed result with an application error
   *
   * @param error - Application error to propagate
   * @returns Failed result wrapper
   * @throws Never. Returns a result object instead of throwing
   */
  public static fail<U = never>(error: AppError): FailResult<U> {
    return new FailResult<U>(error);
  }

  /**
   * Combine multiple results into a single outcome
   *
   * Business rules:
   * - Returns the first failure encountered
   * - Returns success when all results succeed
   *
   * @param results - Result list to aggregate
   * @returns Aggregated result
   * @throws Never. Returns a result object instead of throwing
   */
  public static combine(results: Result<unknown>[]): Result<void> {
    for (const result of results) {
      if (result.isFailure) {
        return result as FailResult<void>;
      }
    }

    return Result.ok();
  }

  /**
   * Narrow a result to the success branch
   *
   * @param result - Result instance to narrow
   * @returns True when the result is successful
   * @throws Never. Returns a boolean instead of throwing
   */
  public static isOk<T>(result: Result<T>): result is OkResult<T> {
    return result.isSuccess;
  }

  /**
   * Narrow a result to the failure branch
   *
   * @param result - Result instance to narrow
   * @returns True when the result is a failure
   * @throws Never. Returns a boolean instead of throwing
   */
  public static isFail<T>(result: Result<T>): result is FailResult<T> {
    return result.isFailure;
  }
}

/**
 * Represent a successful result
 */
export class OkResult<T> extends Result<T> {
  public readonly isSuccess = true as const;

  constructor(private readonly value: T) {
    super();
  }

  /**
   * Access the wrapped success value
   *
   * @returns Success payload
   * @throws Never. Returns a value instead of throwing
   */
  public get data(): T {
    return this.value;
  }

  /**
   * Prevent access to an error payload on success
   *
   * @throws Error when accessed on a successful result
   */
  public get error(): AppError {
    throw new Error('[OkResult] Cannot access .error on a successful result.');
  }

  /**
   * Map the success payload to a new value
   *
   * @param fn - Mapper used to convert the payload
   * @returns Successful result containing the mapped value
   * @throws Error if the mapper throws
   */
  public map<U>(fn: (data: T) => U): OkResult<U> {
    return new OkResult(fn(this.value));
  }
}

/**
 * Represent a failed result
 */
export class FailResult<T> extends Result<T> {
  public readonly isSuccess = false as const;

  constructor(private readonly value: AppError) {
    super();
  }

  /**
   * Prevent access to a success payload on failure
   *
   * @throws Error when accessed on a failed result
   */
  public get data(): T {
    throw new Error(
      `[FailResult] Cannot access .data on a failed result (code: ${this.value.code}).`
    );
  }

  /**
   * Access the wrapped error value
   *
   * @returns Application error payload
   * @throws Never. Returns a value instead of throwing
   */
  public get error(): AppError {
    return this.value;
  }

  /**
   * Re-wrap the error with a different generic type
   *
   * @returns Failed result with the same error payload
   * @throws Never. Returns a result object instead of throwing
   */
  public propagate<U>(): FailResult<U> {
    return new FailResult<U>(this.value);
  }
}

/**
 * Execute an async function and capture failures as a result
 *
 * Business rules:
 * - All thrown errors are mapped using the provided error mapper
 *
 * @param fn - Async operation to execute
 * @param errorMapper - Mapper used to normalize thrown errors
 * @returns Result containing either the resolved value or mapped error
 * @throws Error if the error mapper throws
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper: (error: unknown) => AppError
): Promise<Result<T>> {
  try {
    return Result.ok(await fn());
  } catch (error) {
    return Result.fail(errorMapper(error));
  }
}

/**
 * Chain async result-producing operations while preserving failures
 *
 * Business rules:
 * - Short-circuits on the first failure
 *
 * @param result - Initial result or promise of a result
 * @param next - Function invoked with the success payload
 * @returns Result of the chained operation
 * @throws Error if the initial promise rejects or `next` throws
 */
export async function chainAsync<T, U>(
  result: Result<T> | Promise<Result<T>>,
  next: (data: T) => Promise<Result<U>> | Result<U>
): Promise<Result<U>> {
  const resolved = await result;

  if (resolved.isFailure) {
    return Result.fail(resolved.error);
  }

  return next(resolved.data);
}
