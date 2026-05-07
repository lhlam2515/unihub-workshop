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
    role: "STUDENT",
    jti: "jti-1",
    allowed_workshop_ids: [],
  };

  const mockRegistrationDto = {
    registration_id: "reg-1",
    student_id: "stu-001",
    workshop_id: "ws-1",
    status: "CONFIRMED",
    registered_at: new Date(),
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
    it("calls register with user.sub and dto", async () => {
      const dto = { workshop_id: "ws-1" };
      registrationsService.register.mockResolvedValue(
        Result.ok(mockRegistrationDto)
      );
      await controller.createRegistration(dto, mockUser);
      expect(registrationsService.register).toHaveBeenCalledWith(
        "stu-001",
        dto
      );
    });
  });

  describe("GET /students/me/registrations", () => {
    it("calls getMyRegistrations with user.sub", async () => {
      registrationsService.getMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], total: 0, page: 1, limit: 20 })
      );
      await controller.getMyRegistrations(mockUser);
      expect(registrationsService.getMyRegistrations).toHaveBeenCalledWith(
        "stu-001",
        expect.objectContaining({})
      );
    });

    it("passes status, page, limit query params", async () => {
      registrationsService.getMyRegistrations.mockResolvedValue(
        Result.ok({ items: [], total: 0, page: 2, limit: 10 })
      );
      await controller.getMyRegistrations(mockUser, "CONFIRMED", "2", "10");
      expect(registrationsService.getMyRegistrations).toHaveBeenCalledWith(
        "stu-001",
        expect.objectContaining({ status: "CONFIRMED", page: 2, limit: 10 })
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
