import {
  authErrors,
  categoryToStatus,
  createError,
  paymentErrors,
  registrationErrors,
  seatErrors,
  systemErrors,
  workshopErrors,
} from "./errors";

describe("createError", () => {
  it("creates a normalized AppError", () => {
    const err = createError({
      category: "CONFLICT",
      code: "REGISTRATION_DUPLICATE",
      message: "dup",
      context: { userId: "u1" },
    });
    expect(err.category).toBe("CONFLICT");
    expect(err.code).toBe("REGISTRATION_DUPLICATE");
    expect(err.message).toBe("dup");
    expect(err.context).toEqual({ userId: "u1" });
  });
});

describe("categoryToStatus", () => {
  const cases: [string, string, number][] = [
    ["VALIDATION", "400", 400],
    ["AUTH", "401", 401],
    ["FORBIDDEN", "403", 403],
    ["NOT_FOUND", "404", 404],
    ["CONFLICT", "409", 409],
    ["BUSINESS", "422", 422],
    ["RATE_LIMIT", "429", 429],
    ["INTERNAL", "500", 500],
    ["EXTERNAL", "502", 502],
    ["OVERLOADED", "503", 503],
  ];
  it.each(cases)("maps %s to %s", (_label, _expectedLabel, expectedStatus) => {
    expect(categoryToStatus(_label as any)).toBe(expectedStatus);
  });
});

describe("authErrors", () => {
  it("tokenInvalid", () => {
    const e = authErrors.tokenInvalid();
    expect(e.code).toBe("TOKEN_INVALID");
    expect(e.category).toBe("AUTH");
  });

  it("tokenExpired", () => {
    const e = authErrors.tokenExpired();
    expect(e.code).toBe("TOKEN_EXPIRED");
    expect(e.category).toBe("AUTH");
  });

  it("tokenRevoked", () => {
    const e = authErrors.tokenRevoked("jti-123");
    expect(e.code).toBe("TOKEN_REVOKED");
    expect(e.category).toBe("AUTH");
  });

  it("refreshTokenInvalid", () => {
    const e = authErrors.refreshTokenInvalid();
    expect(e.code).toBe("REFRESH_TOKEN_INVALID");
    expect(e.category).toBe("AUTH");
  });

  it("invalidCredentials", () => {
    const e = authErrors.invalidCredentials();
    expect(e.code).toBe("INVALID_CREDENTIALS");
    expect(e.category).toBe("AUTH");
  });

  it("userSuspended", () => {
    const e = authErrors.userSuspended("u1");
    expect(e.code).toBe("USER_SUSPENDED");
    expect(e.category).toBe("FORBIDDEN");
  });
});

describe("seatErrors", () => {
  it("unavailable", () => {
    const e = seatErrors.unavailable("ws-1");
    expect(e.code).toBe("SEAT_UNAVAILABLE");
    expect(e.category).toBe("BUSINESS");
  });

  it("lockExpired", () => {
    const e = seatErrors.lockExpired("ws-1", "reg-1");
    expect(e.code).toBe("SEAT_LOCK_EXPIRED");
    expect(e.category).toBe("GONE");
  });
});

describe("registrationErrors", () => {
  it("duplicate", () => {
    const e = registrationErrors.duplicate("u1", "ws-1");
    expect(e.code).toBe("REGISTRATION_DUPLICATE");
    expect(e.category).toBe("CONFLICT");
  });

  it("notFound", () => {
    const e = registrationErrors.notFound("reg-1");
    expect(e.code).toBe("REGISTRATION_NOT_FOUND");
    expect(e.category).toBe("NOT_FOUND");
  });

  it("alreadyCancelled", () => {
    const e = registrationErrors.alreadyCancelled("reg-1");
    expect(e.code).toBe("REGISTRATION_CANCELLED");
    expect(e.category).toBe("CONFLICT");
  });
});

describe("paymentErrors", () => {
  it("duplicate", () => {
    const e = paymentErrors.duplicate("key-1", "pay-existing");
    expect(e.code).toBe("PAYMENT_DUPLICATE");
    expect(e.category).toBe("CONFLICT");
  });

  it("alreadySuccess", () => {
    const e = paymentErrors.alreadySuccess("pay-1");
    expect(e.code).toBe("PAYMENT_ALREADY_SUCCESS");
    expect(e.category).toBe("CONFLICT");
  });

  it("gatewayError", () => {
    const e = paymentErrors.gatewayError("MOCK", "timeout");
    expect(e.code).toBe("PAYMENT_GATEWAY_ERROR");
    expect(e.category).toBe("EXTERNAL");
  });

  it("gatewayOpen", () => {
    const e = paymentErrors.gatewayOpen("MOCK", "2025-01-01T00:00:00Z");
    expect(e.code).toBe("PAYMENT_GATEWAY_OPEN");
    expect(e.category).toBe("OVERLOADED");
  });

  it("timeout", () => {
    const e = paymentErrors.timeout("MOCK", "pay-1");
    expect(e.code).toBe("PAYMENT_TIMEOUT");
    expect(e.category).toBe("EXTERNAL");
  });

  it("notFound", () => {
    const e = paymentErrors.notFound("pay-1");
    expect(e.code).toBe("PAYMENT_NOT_FOUND");
    expect(e.category).toBe("NOT_FOUND");
  });
});

describe("workshopErrors", () => {
  it("notFound", () => {
    const e = workshopErrors.notFound("ws-1");
    expect(e.code).toBe("WORKSHOP_NOT_FOUND");
    expect(e.category).toBe("NOT_FOUND");
  });

  it("notPublished", () => {
    const e = workshopErrors.notPublished("ws-1", "DRAFT");
    expect(e.code).toBe("WORKSHOP_NOT_PUBLISHED");
    expect(e.category).toBe("BUSINESS");
  });

  it("cancelled", () => {
    const e = workshopErrors.cancelled("ws-1");
    expect(e.code).toBe("WORKSHOP_CANCELLED");
    expect(e.category).toBe("BUSINESS");
  });

  it("full", () => {
    const e = workshopErrors.full("ws-1");
    expect(e.code).toBe("WORKSHOP_FULL");
    expect(e.category).toBe("BUSINESS");
  });
});

describe("systemErrors", () => {
  it("internal", () => {
    const e = systemErrors.internal("db error");
    expect(e.code).toBe("INTERNAL_ERROR");
    expect(e.category).toBe("INTERNAL");
    expect(e.message).toBe("An unexpected internal error occurred.");
  });
});
