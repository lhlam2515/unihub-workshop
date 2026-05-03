import { FailResult, OkResult, Result, chainAsync, tryCatch } from "./result";

import type { AppError } from "./types";

describe("Result", () => {
  describe("ok", () => {
    it("creates a successful result with data", () => {
      const result = Result.ok(42);
      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.data).toBe(42);
    });

    it("creates a successful result without data", () => {
      const result = Result.ok();
      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe("fail", () => {
    it("creates a failed result", () => {
      const error: AppError = {
        category: "NOT_FOUND",
        code: "WORKSHOP_NOT_FOUND",
        message: "Workshop not found",
      };
      const result = Result.fail(error);
      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });

    it("accessing .data on fail throws", () => {
      const result = Result.fail<void>({
        category: "INTERNAL",
        code: "INTERNAL_ERROR",
        message: "fail",
      });
      expect(() => result.data).toThrow(
        "[FailResult] Cannot access .data on a failed result"
      );
    });
  });

  describe("combine", () => {
    it("returns first failure", () => {
      const err1: AppError = {
        category: "NOT_FOUND",
        code: "USER_NOT_FOUND",
        message: "u1",
      };
      const err2: AppError = {
        category: "CONFLICT",
        code: "REGISTRATION_DUPLICATE",
        message: "dup",
      };
      const results = [Result.fail(err1), Result.fail(err2)];
      const combined = Result.combine(results);
      expect(combined.isFailure).toBe(true);
      expect(combined.error).toBe(err1);
    });

    it("returns ok when all succeed", () => {
      const results = [Result.ok(1), Result.ok("two")];
      const combined = Result.combine(results);
      expect(combined.isSuccess).toBe(true);
    });
  });

  describe("isOk / isFail", () => {
    it("narrows an OkResult", () => {
      const r: Result<number> = Result.ok(10);
      expect(Result.isOk(r)).toBe(true);
      expect(Result.isFail(r)).toBe(false);
    });

    it("narrows a FailResult", () => {
      const r: Result<number> = Result.fail({
        category: "INTERNAL",
        code: "INTERNAL_ERROR",
        message: "",
      });
      expect(Result.isOk(r)).toBe(false);
      expect(Result.isFail(r)).toBe(true);
    });
  });
});

describe("OkResult", () => {
  it("throws on .error access", () => {
    const ok = new OkResult("data");
    expect(() => ok.error).toThrow(
      "[OkResult] Cannot access .error on a successful result."
    );
  });

  it("maps value", () => {
    const ok = new OkResult(2);
    const mapped = ok.map((x) => x * 3);
    expect(mapped.data).toBe(6);
  });
});

describe("FailResult", () => {
  it("propagates error with different type", () => {
    const err: AppError = {
      category: "BUSINESS",
      code: "RATE_LIMIT_EXCEEDED",
      message: "slow",
    };
    const fail = new FailResult<string>(err);
    const propagated = fail.propagate<number>();
    expect(propagated.isFailure).toBe(true);
    expect(propagated.error).toBe(err);
  });
});

describe("tryCatch", () => {
  it("returns ok on success", async () => {
    const result = await tryCatch(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => "value",
      () => ({
        category: "INTERNAL" as const,
        code: "INTERNAL_ERROR" as const,
        message: "",
      })
    );
    expect(result.isSuccess).toBe(true);
    expect(result.data).toBe("value");
  });

  it("returns fail on thrown error", async () => {
    const result = await tryCatch(
      () => {
        throw new Error("db down");
      },
      (err) => ({
        category: "INTERNAL" as const,
        code: "INTERNAL_ERROR" as const,
        message: `Caught: ${(err as Error).message}`,
      })
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toBe("Caught: db down");
  });
});

describe("chainAsync", () => {
  it("short-circuits on failure", async () => {
    const result = await chainAsync(
      Result.fail<number>({
        category: "NOT_FOUND",
        code: "USER_NOT_FOUND",
        message: "no user",
      }),
      (n) => Result.ok(n * 2)
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  it("chains on success", async () => {
    const result = await chainAsync(Result.ok(5), (n) => Result.ok(n * 2));
    expect(result.isSuccess).toBe(true);
    expect(result.data).toBe(10);
  });

  it("propagates failure from chained function", async () => {
    const result = await chainAsync(Result.ok(5), () =>
      Result.fail<number>({
        category: "BUSINESS",
        code: "RATE_LIMIT_EXCEEDED",
        message: "too fast",
      })
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
