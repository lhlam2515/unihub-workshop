import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { RolesGuard } from "@/modules/iam/guards/roles.guard";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { RegistrationsController } from "./registrations.controller";
import { RegistrationsService } from "../services/registrations.service";

describe("RegistrationsController", () => {
  let controller: RegistrationsController;
  let registrationsService: jest.Mocked<RegistrationsService>;

  const mockUser: JwtPayload = {
    sub: "stu-001",
    studentId: "stu-001",
    role: "STUDENT",
    jti: "jti-1",
    allowed_workshop_ids: [],
  };

  const mockRegistrationDto = {
    id: "reg-1",
    studentId: "stu-001",
    workshopId: "ws-1",
    status: "CONFIRMED",
    qrCode: null,
    registeredAt: new Date().toISOString(),
    confirmedAt: null,
    cancelledAt: null,
    nextStep: null,
    workshop: {
      id: "ws-1",
      title: "Workshop 1",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      seatsTotal: 50,
      seatsAvailable: 30,
      price: 0,
      currency: "VND",
      status: "OPEN",
      speaker: null,
      room: null,
      isRegistered: true,
    },
  };

  beforeEach(async () => {
    registrationsService = {
      register: jest.fn(),
      getMyRegistrations: jest.fn(),
      getRegistrationDetail: jest.fn(),
      cancelRegistration: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      controllers: [RegistrationsController],
      providers: [
        { provide: RegistrationsService, useValue: registrationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<RegistrationsController>(RegistrationsController);
  });

  describe("POST /registrations", () => {
    const IDEM_KEY = "idem-key-001";
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
    } as unknown as import("express").Response;

    it("calls register with user.sub, dto, and idempotencyKey", async () => {
      const dto = { workshopId: "ws-1" };
      registrationsService.register.mockResolvedValue(
        Result.ok({ registration: mockRegistrationDto, isReplay: false })
      );
      await controller.createRegistration(
        dto,
        IDEM_KEY,
        mockUser,
        mockResponse
      );
      expect(registrationsService.register).toHaveBeenCalledWith(
        "stu-001",
        dto,
        IDEM_KEY
      );
    });

    it("returns 201 for first-time registration", async () => {
      const dto = { workshopId: "ws-1" };
      registrationsService.register.mockResolvedValue(
        Result.ok({ registration: mockRegistrationDto, isReplay: false })
      );
      await controller.createRegistration(
        dto,
        IDEM_KEY,
        mockUser,
        mockResponse
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it("returns 200 for idempotent replay", async () => {
      const dto = { workshopId: "ws-1" };
      registrationsService.register.mockResolvedValue(
        Result.ok({ registration: mockRegistrationDto, isReplay: true })
      );
      const freshResponse = {
        status: jest.fn().mockReturnThis(),
      } as unknown as import("express").Response;
      await controller.createRegistration(
        dto,
        IDEM_KEY,
        mockUser,
        freshResponse
      );
      expect(freshResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe("GET /students/me/registrations", () => {
    it("calls getMyRegistrations with user.sub", async () => {
      registrationsService.getMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 20 })
      );
      await controller.getMyRegistrations(mockUser, { limit: 20 } as any);
      expect(registrationsService.getMyRegistrations).toHaveBeenCalledWith(
        "stu-001",
        expect.objectContaining({})
      );
    });

    it("passes status, limit query params", async () => {
      registrationsService.getMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], nextCursor: null, hasMore: false, limit: 10 })
      );
      await controller.getMyRegistrations(mockUser, {
        status: ["CONFIRMED"],
        limit: 10,
      });
      expect(registrationsService.getMyRegistrations).toHaveBeenCalledWith(
        "stu-001",
        expect.objectContaining({ status: ["CONFIRMED"], limit: 10 })
      );
    });
  });

  describe("GET /students/me/registrations/:id", () => {
    it("calls getRegistrationDetail with user.sub and id", async () => {
      registrationsService.getRegistrationDetail.mockResolvedValue(
        Result.ok(mockRegistrationDto)
      );
      await controller.getMyRegistration("reg-1", mockUser);
      expect(registrationsService.getRegistrationDetail).toHaveBeenCalledWith(
        "stu-001",
        "reg-1"
      );
    });
  });

  describe("DELETE /registrations/:id", () => {
    it("calls cancelRegistration with user.sub and id", async () => {
      registrationsService.cancelRegistration.mockResolvedValue(
        Result.ok(mockRegistrationDto)
      );
      await controller.cancelRegistration("reg-1", mockUser);
      expect(registrationsService.cancelRegistration).toHaveBeenCalledWith(
        "stu-001",
        "reg-1"
      );
    });
  });
});
