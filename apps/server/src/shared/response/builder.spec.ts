import {
  buildMeta,
  paginatedResponse,
  sanitizeError,
  successResponse,
} from "./builder";

describe("buildMeta", () => {
  it("creates metadata with provided requestId", () => {
    const meta = buildMeta("req-1");
    expect(meta.requestId).toBe("req-1");
    expect(meta.apiVersion).toBe("v1");
    expect(meta.timestamp).toBeDefined();
  });

  it("generates requestId when omitted", () => {
    const meta = buildMeta();
    expect(meta.requestId).toBeDefined();
    expect(typeof meta.requestId).toBe("string");
  });

  it("computes processingMs when start time is provided", () => {
    const start = Date.now() - 50;
    const meta = buildMeta("req-1", start);
    expect(meta.processingMs).toBeGreaterThanOrEqual(0);
  });
});

describe("sanitizeError", () => {
  it("obscures internal error messages", () => {
    const sanitized = sanitizeError({
      category: "INTERNAL",
      code: "INTERNAL_ERROR",
      message: "connection pool exhausted",
      context: { poolSize: 10 },
    });
    expect(sanitized.message).toBe(
      "An unexpected error occurred. Please try again later."
    );
    expect(sanitized.code).toBe("INTERNAL_ERROR");
  });

  it("preserves non-internal error messages", () => {
    const sanitized = sanitizeError({
      category: "NOT_FOUND",
      code: "WORKSHOP_NOT_FOUND",
      message: "Workshop ws-1 not found",
    });
    expect(sanitized.message).toBe("Workshop ws-1 not found");
  });

  it("passes through fieldErrors", () => {
    const sanitized = sanitizeError({
      category: "VALIDATION",
      code: "VALIDATION_FAILED",
      message: "Invalid input",
      fieldErrors: [
        { field: "email", rule: "email", message: "Invalid email" },
      ],
    });
    expect(sanitized.fieldErrors).toHaveLength(1);
    expect(sanitized.fieldErrors![0].field).toBe("email");
  });
});

describe("successResponse", () => {
  it("wraps data in success envelope", () => {
    const resp = successResponse({ id: "1" });
    expect(resp.success).toBe(true);
    expect(resp.data).toEqual({ id: "1" });
    expect(resp.meta).toBeDefined();
  });
});

describe("paginatedResponse", () => {
  it("computes pagination metadata", () => {
    const resp = paginatedResponse(["a", "b"], {
      limit: 10,
      nextCursor: "cursor-2",
      hasMore: true,
      total: 25,
    });
    expect(resp.success).toBe(true);
    expect(resp.data!.data).toEqual(["a", "b"]);
    expect(resp.pagination).toBeDefined();
    expect(resp.pagination!.limit).toBe(10);
    expect(resp.pagination!.nextCursor).toBe("cursor-2");
    expect(resp.pagination!.hasMore).toBe(true);
    expect(resp.pagination!.total).toBe(25);
  });

  it("sets nextCursor to null on last page", () => {
    const resp = paginatedResponse([], {
      limit: 10,
      nextCursor: null,
      hasMore: false,
      total: 25,
    });
    expect(resp.pagination!.nextCursor).toBeNull();
    expect(resp.pagination!.hasMore).toBe(false);
  });

  it("handles empty results", () => {
    const resp = paginatedResponse([], {
      limit: 20,
      nextCursor: null,
      hasMore: false,
      total: 0,
    });
    expect(resp.pagination!.nextCursor).toBeNull();
    expect(resp.pagination!.hasMore).toBe(false);
    expect(resp.pagination!.total).toBe(0);
  });
});
