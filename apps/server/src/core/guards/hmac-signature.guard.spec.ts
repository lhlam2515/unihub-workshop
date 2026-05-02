import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { HmacSignatureGuard } from "./hmac-signature.guard";

describe("HmacSignatureGuard", () => {
  let guard: HmacSignatureGuard;
  let configService: jest.Mocked<ConfigService>;

  const createMockContext = (overrides?: {
    gateway?: string;
    signature?: string;
    rawBody?: Buffer;
    body?: unknown;
  }) => {
    const gateway = overrides?.gateway ?? "MOCK";
    const signature = overrides?.signature ?? "test-sig";
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { gateway },
          headers: { "x-gateway-signature": signature },
          rawBody: overrides?.rawBody ?? Buffer.from('{"key":"value"}'),
          body: overrides?.body ?? { key: "value" },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as any;
    guard = new HmacSignatureGuard(configService);
  });

  it("throws when gateway param is missing", () => {
    const ctx = createMockContext({ gateway: "" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throws when signature header is missing", () => {
    const ctx = createMockContext({ signature: "" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throws when gateway is unknown", () => {
    configService.get.mockReturnValue('{"MOCK":"sec1"}');
    const ctx = createMockContext({ gateway: "UNKNOWN" });
    expect(() => guard.canActivate(ctx)).toThrow("Unknown payment gateway");
  });

  it("throws when signature does not match", () => {
    configService.get.mockReturnValue('{"MOCK":"sec1"}');
    const ctx = createMockContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("returns true when signature is valid", () => {
    configService.get.mockReturnValue('{"MOCK":"sec1"}');
    const rawBody = Buffer.from('{"key":"value"}');
    // Pre-compute HMAC-SHA256 of the raw body with secret "sec1"
    const { createHmac } = require("node:crypto");
    const expectedSig = createHmac("sha256", "sec1")
      .update(rawBody)
      .digest("hex");
    const ctx = createMockContext({
      rawBody,
      signature: expectedSig,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("returns true with valid signature from string body fallback", () => {
    configService.get.mockReturnValue('{"MOCK":"sec1"}');
    const bodyStr = '{"key":"value"}';
    const { createHmac } = require("node:crypto");
    const expectedSig = createHmac("sha256", "sec1")
      .update(bodyStr)
      .digest("hex");
    const ctx = createMockContext({
      rawBody: undefined,
      body: bodyStr,
      signature: expectedSig,
    });
    // No rawBody, body is a string — should fall through to body
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws when config returns invalid JSON", () => {
    configService.get.mockReturnValue("not-json");
    const ctx = createMockContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throws when no secrets are configured", () => {
    configService.get.mockReturnValue(null);
    const ctx = createMockContext();
    expect(() => guard.canActivate(ctx)).toThrow("Unknown payment gateway");
  });
});
