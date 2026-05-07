import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockContext = (user?: { role?: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as any;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new RolesGuard(reflector);
  });

  it("allows when no roles are required", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it("allows when required roles is empty", () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it("allows when user role matches required role", () => {
    reflector.getAllAndOverride.mockReturnValue(["STUDENT"]);
    expect(guard.canActivate(mockContext({ role: "STUDENT" }))).toBe(true);
  });

  it("allows when user role is in multiple required roles", () => {
    reflector.getAllAndOverride.mockReturnValue(["STUDENT", "BTC"]);
    expect(guard.canActivate(mockContext({ role: "BTC" }))).toBe(true);
  });

  it("throws ForbiddenException when user role does not match", () => {
    reflector.getAllAndOverride.mockReturnValue(["BTC"]);
    expect(() => guard.canActivate(mockContext({ role: "STUDENT" }))).toThrow(
      ForbiddenException
    );
  });

  it("throws ForbiddenException when user has no role", () => {
    reflector.getAllAndOverride.mockReturnValue(["BTC"]);
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      ForbiddenException
    );
  });

  it("throws ForbiddenException when user is undefined", () => {
    reflector.getAllAndOverride.mockReturnValue(["BTC"]);
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });
});
