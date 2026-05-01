import { Test, type TestingModule } from "@nestjs/testing";
import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WorkshopNotificationPublisher", () => {
  let service: WorkshopNotificationPublisher;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkshopNotificationPublisher],
    }).compile();

    service = module.get<WorkshopNotificationPublisher>(
      WorkshopNotificationPublisher
    );
  });

  describe("publishCancelled", () => {
    it("logs a WORKSHOP_CANCELLED event (fire-and-forget)", () => {
      const loggerSpy = jest.spyOn(service["logger"], "log");
      const workshop = {
        workshopId: "w-001",
        title: "Test Workshop",
      } as any;

      service.publishCancelled(workshop);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WORKSHOP_CANCELLED]")
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test Workshop")
      );
    });
  });

  describe("publishEmergencyUpdate", () => {
    it("logs a WORKSHOP_UPDATED event with changes (FR-F02-005)", () => {
      const loggerSpy = jest.spyOn(service["logger"], "log");
      const workshop = {
        workshopId: "w-001",
        title: "Test Workshop",
      } as any;
      const changes = { roomId: "r-002", startsAt: new Date("2026-07-01") };

      service.publishEmergencyUpdate(workshop, changes);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WORKSHOP_UPDATED]")
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test Workshop")
      );
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("r-002"));
    });

    it("works with empty changes object", () => {
      const loggerSpy = jest.spyOn(service["logger"], "log");
      const workshop = {
        workshopId: "w-002",
        title: "Another Workshop",
      } as any;

      service.publishEmergencyUpdate(workshop, {});

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WORKSHOP_UPDATED]")
      );
    });
  });
});
