import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
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
      clearCookie: jest.fn(),
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
        accountType: "STUDENT" as const,
        password: "pass",
        studentId: "student-1",
        email: "test@test.com",
      };
      authService.login.mockResolvedValue(
        Result.ok({
          accessToken: "at1",
          refreshToken: "rt1",
          expiresIn: 900,
        } as any)
      );
      const res = mockResponse();
      await controller.login(dto, res);
      expect(authService.login).toHaveBeenCalledWith({
        accountType: "STUDENT",
        password: "pass",
        studentId: "student-1",
        email: "test@test.com",
      });
    });

    it("sets refresh cookie on success", async () => {
      const dto = {
        accountType: "STUDENT" as const,
        password: "pass",
        studentId: "student-1",
        email: "test@test.com",
      };
      authService.login.mockResolvedValue(
        Result.ok({
          accessToken: "at1",
          refreshToken: "rt1",
          expiresIn: 900,
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
      const dto = { refreshToken: "rt1" };
      authService.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresIn: 28800,
        } as any)
      );
      const res = mockResponse();
      const req = { cookies: {} } as any;
      await controller.refresh(dto, res, req);
      expect(authService.refreshToken).toHaveBeenCalledWith("rt1", "MOBILE");
    });

    it("reads refresh token from cookie when body is empty", async () => {
      const dto = { refreshToken: "" };
      authService.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresIn: 900,
        } as any)
      );
      const res = mockResponse();
      const req = { cookies: { refreshToken: "cookie-rt" } } as any;
      await controller.refresh(dto, res, req);
      expect(authService.refreshToken).toHaveBeenCalledWith("cookie-rt", "WEB");
    });

    it("returns refreshToken null for web cookie refresh flow", async () => {
      const dto = { refreshToken: "" };
      authService.refreshToken.mockResolvedValue(
        Result.ok({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresIn: 900,
        } as any)
      );
      const res = mockResponse();
      const req = { cookies: { refreshToken: "cookie-rt" } } as any;

      const result = await controller.refresh(dto, res, req);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.refreshToken).toBeNull();
      }
    });
  });

  describe("POST /auth/logout", () => {
    it("calls authService.logout with user sub, jti, and refresh token from cookie", async () => {
      authService.logout.mockResolvedValue(Result.ok());
      const req = { cookies: { refreshToken: "rt-cookie" } } as any;
      const res = mockResponse();
      await controller.logout(mockUser, req, res);
      expect(authService.logout).toHaveBeenCalledWith(
        "usr-1",
        "jti-1",
        "rt-cookie"
      );
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
