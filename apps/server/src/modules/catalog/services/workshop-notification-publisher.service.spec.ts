import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import { Queue } from "bullmq";

import { NOTIFICATION_QUEUE } from "@/shared/queues/queue.constants";

import { WorkshopNotificationPublisher } from "./workshop-notification-publisher.service";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WorkshopNotificationPublisher", () => {
  let service: WorkshopNotificationPublisher;
  let notificationQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopNotificationPublisher,
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: {
            add: jest.fn().mockResolvedValue({ id: "job-1" } as any),
          },
        },
      ],
    }).compile();

    service = module.get<WorkshopNotificationPublisher>(
      WorkshopNotificationPublisher
    );
    notificationQueue = module.get(getQueueToken(NOTIFICATION_QUEUE));
  });

  describe("publishCancelled", () => {
    it("enqueues a WORKSHOP_CANCELLED event to the notification queue", async () => {
      const workshop = {
        workshopId: "w-001",
        title: "Test Workshop",
      } as any;

      await service.publishCancelled(workshop);

      expect(notificationQueue.add).toHaveBeenCalledWith(
        "workshop.cancelled",
        expect.objectContaining({
          workshopId: "w-001",
          title: "Test Workshop",
        })
      );
    });
  });

  describe("publishEmergencyUpdate", () => {
    it("enqueues a WORKSHOP_UPDATED event with changes (FR-F02-005)", async () => {
      const workshop = {
        workshopId: "w-001",
        title: "Test Workshop",
      } as any;
      const changes = { roomId: "r-002", startsAt: new Date("2026-07-01") };

      await service.publishEmergencyUpdate(workshop, changes);

      expect(notificationQueue.add).toHaveBeenCalledWith(
        "workshop.emergency-update",
        expect.objectContaining({
          workshopId: "w-001",
          changes: { roomChanged: true, scheduleChanged: true },
        })
      );
    });

    it("works with empty changes object", async () => {
      const workshop = {
        workshopId: "w-002",
        title: "Another Workshop",
      } as any;

      await service.publishEmergencyUpdate(workshop, {});

      expect(notificationQueue.add).toHaveBeenCalled();
    });

    it("falls back to logging when queue is unreachable", async () => {
      notificationQueue.add.mockRejectedValue(new Error("Queue unreachable"));
      const loggerSpy = jest.spyOn(service["logger"], "log");
      const workshop = {
        workshopId: "w-003",
        title: "Fallback Workshop",
      } as any;

      await service.publishEmergencyUpdate(workshop, { roomId: "r-003" });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WORKSHOP_UPDATED]")
      );
    });
  });
});
