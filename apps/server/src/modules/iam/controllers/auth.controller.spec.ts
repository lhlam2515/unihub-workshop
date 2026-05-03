import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { AuthController } from "./auth.controller";
import { AuthService } from "../services/auth.service";

import type { Response } from "express";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockResponse = () => {
    const res: Partial<Response> = {
      cookie: jest.fn(),
    };
    return res as Response;
  };

  const mockUser: JwtPayload = {
    sub: "usr-1",
    role: "STUDENT",
    jti: "jti-1",
    allowed_workshop_ids: [],
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe("POST /auth/login", () => {
    it("returns result from authService.login", async () => {
      const dto = {
        email: "test@test.com",
        password: "pass",
        platform: "WEB" as const,
      };
      authService.login.mockResolvedValue(
        Result.ok({
          access_token: "at1",
          refresh_token: "rt1",
          expires_in: 900,
        } as any)
      );
      const res = mockResponse();
      await controller.login(dto, res);
      expect(authService.login).toHaveBeenCalledWith(
        "test@test.com",
        "pass",
        "WEB"
      );
    });

    it("sets refresh cookie for WEB platform", async () => {
      const dto = {
        email: "test@test.com",
        password: "pass",
        platform: "WEB" as const,
      };
      authService.login.mockResolvedValue(
        Result.ok({
          access_token: "at1",
          refresh_token: "rt1",
          expires_in: 900,
        } as any)
      );
      const res = mockResponse();
      await controller.login(dto, res);
      expect(res.cookie).toHaveBeenCalledWith(
        "refreshToken",
        "rt1",
        expect.any(Object)
      );
    });
  });

  describe("POST /auth/refresh", () => {
    it("returns result from authService.refreshToken", async () => {
      const dto = { refresh_token: "rt1", platform: "MOBILE" as const };
      authService.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresIn: 28800,
        } as any)
      );
      const res = mockResponse();
      await controller.refresh(dto, res, {
        cookies: {},
      } as any);
      expect(authService.refreshToken).toHaveBeenCalledWith("rt1", "MOBILE");
    });

    it("reads refresh token from cookie when body is empty", async () => {
      const dto = { refresh_token: "", platform: "WEB" as const };
      authService.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresIn: 900,
        } as any)
      );
      const res = mockResponse();
      await controller.refresh(dto, res, {
        cookies: { refreshToken: "cookie-rt" },
      } as any);
      expect(authService.refreshToken).toHaveBeenCalledWith("cookie-rt", "WEB");
    });
  });

  describe("POST /auth/logout", () => {
    it("calls authService.logout with user sub and jti", async () => {
      authService.logout.mockResolvedValue(Result.ok());
      await controller.logout(mockUser);
      expect(authService.logout).toHaveBeenCalledWith("usr-1", "jti-1");
    });
  });

  describe("GET /auth/me", () => {
    it("calls authService.getMe with user sub", async () => {
      authService.getMe.mockResolvedValue(Result.ok({} as any));
      await controller.getMe(mockUser);
      expect(authService.getMe).toHaveBeenCalledWith("usr-1");
    });
  });
});
