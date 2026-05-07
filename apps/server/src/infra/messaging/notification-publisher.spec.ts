import { Test } from "@nestjs/testing";

import { MESSAGING_TOKEN } from "./messaging.constants";
import { NotificationPublisher } from "./notification-publisher";

describe("NotificationPublisher", () => {
  let publisher: NotificationPublisher;
  let mockQueue: { enqueue: jest.Mock };

  beforeEach(async () => {
    mockQueue = { enqueue: jest.fn().mockResolvedValue({ id: "job-1" }) };

    const module = await Test.createTestingModule({
      providers: [
        NotificationPublisher,
        { provide: MESSAGING_TOKEN.NOTIFICATION_QUEUE, useValue: mockQueue },
      ],
    }).compile();

    publisher = module.get<NotificationPublisher>(NotificationPublisher);
  });

  it("fires an event into the notification queue", () => {
    publisher.fire("registration.confirmed", {
      registrationId: "reg-1",
      studentId: "stu-1",
      workshopId: "ws-1",
    });

    expect(mockQueue.enqueue).toHaveBeenCalledWith("registration.confirmed", {
      registrationId: "reg-1",
      studentId: "stu-1",
      workshopId: "ws-1",
    });
  });

  it("does not throw when the queue rejects", () => {
    mockQueue.enqueue.mockRejectedValue(new Error("Redis down"));

    expect(() => publisher.fire("registration.confirmed", {})).not.toThrow();
  });
});
