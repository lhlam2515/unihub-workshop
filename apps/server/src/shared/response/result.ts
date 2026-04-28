import type { AppError } from './types';

/**
 * Algebraic result type used to model success and failure without throwing.
 */
export abstract class Result<T> {
  /** Indicates whether the result is successful. */
  public abstract readonly isSuccess: boolean;

  /** Convenience inverse of `isSuccess`. */
  public get isFailure(): boolean {
    return !this.isSuccess;
  }

  /** Returns the success payload. */
  public abstract get data(): T;

  /** Returns the failure payload. */
  public abstract get error(): AppError;

  /** Creates a successful result. */
  public static ok<U>(data: U): OkResult<U>;
  /** Creates a successful result without a value. */
  public static ok(): OkResult<void>;
  public static ok<U>(data?: U): OkResult<U | void> {
    return new OkResult(data as U);
  }

  /** Creates a failed result. */
  public static fail<U = never>(error: AppError): FailResult<U> {
    return new FailResult<U>(error);
  }

  /** Returns the first failure from a list of results, or success if all pass. */
  public static combine(results: Result<unknown>[]): Result<void> {
    for (const result of results) {
      if (result.isFailure) {
        return result as FailResult<void>;
      }
    }

    return Result.ok();
  }

  /** Narrows a result to `OkResult<T>`. */
  public static isOk<T>(result: Result<T>): result is OkResult<T> {
    return result.isSuccess;
  }

  /** Narrows a result to `FailResult<T>`. */
  public static isFail<T>(result: Result<T>): result is FailResult<T> {
    return result.isFailure;
  }
}

/**
 * Successful result wrapper.
 */
export class OkResult<T> extends Result<T> {
  public readonly isSuccess = true as const;

  constructor(private readonly value: T) {
    super();
  }

  /** Returns the wrapped success value. */
  public get data(): T {
    return this.value;
  }

  /** Successful results do not expose an error payload. */
  public get error(): AppError {
    throw new Error('[OkResult] Cannot access .error on a successful result.');
  }

  /** Maps the success value to another successful result. */
  public map<U>(fn: (data: T) => U): OkResult<U> {
    return new OkResult(fn(this.value));
  }
}

/**
 * Failed result wrapper.
 */
export class FailResult<T> extends Result<T> {
  public readonly isSuccess = false as const;

  constructor(private readonly value: AppError) {
    super();
  }

  /** Failed results do not expose a success payload. */
  public get data(): T {
    throw new Error(
      `[FailResult] Cannot access .data on a failed result (code: ${this.value.code}).`
    );
  }

  /** Returns the wrapped error value. */
  public get error(): AppError {
    return this.value;
  }

  /** Re-wraps the same error with a different generic type. */
  public propagate<U>(): FailResult<U> {
    return new FailResult<U>(this.value);
  }
}

/**
 * Executes an async function and converts thrown errors into a `Result`.
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
 * Chains async result-producing operations while preserving failures.
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
