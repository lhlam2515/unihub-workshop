import { Result } from "@/shared/response/result";

import { WorkshopsAdminController } from "./workshops-admin.controller";
import { WorkshopsService } from "../services/workshops.service";

import type { Response } from "express";

describe("WorkshopsAdminController", () => {
  let controller: WorkshopsAdminController;
  let workshopsService: jest.Mocked<WorkshopsService>;
  let response: Response;

  const workshop = {
    id: "workshop-1",
    version: 7,
  } as any;

  beforeEach(() => {
    workshopsService = {
      listAdmin: jest.fn(),
      createWorkshop: jest.fn(),
      getAdminDetail: jest.fn(),
      updateWorkshop: jest.fn(),
      publishWorkshop: jest.fn(),
      emergencyUpdate: jest.fn(),
      cancelWorkshop: jest.fn(),
      getStats: jest.fn(),
    } as any;
    response = {
      header: jest.fn(),
    } as any;
    controller = new WorkshopsAdminController(workshopsService);
  });

  it("sets ETag on successful create responses", async () => {
    workshopsService.createWorkshop.mockResolvedValue(Result.ok(workshop));

    const result = await controller.createWorkshop(
      {} as any,
      {
        sub: "user-1",
      } as any,
      response
    );

    expect(result.isSuccess).toBe(true);
    expect(response.header).toHaveBeenCalledWith("ETag", '"7"');
  });

  it("requires a valid If-Match header for draft updates", async () => {
    const result = await controller.updateWorkshop(
      "workshop-1",
      {},
      undefined,
      response
    );

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.fieldErrors).toEqual([
      {
        field: "If-Match",
        rule: "required",
        message: "If-Match header is required.",
      },
    ]);
    expect(workshopsService.updateWorkshop).not.toHaveBeenCalled();
  });

  it("sets ETag and passes parsed If-Match for publish", async () => {
    workshopsService.publishWorkshop.mockResolvedValue(Result.ok(workshop));

    const result = await controller.publishWorkshop(
      "workshop-1",
      '"6"',
      response
    );

    expect(result.isSuccess).toBe(true);
    expect(workshopsService.publishWorkshop).toHaveBeenCalledWith(
      "workshop-1",
      6
    );
    expect(response.header).toHaveBeenCalledWith("ETag", '"7"');
  });
});
