import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";

import { NotificationPublisher } from "./notification-publisher";
import { NOTIFICATION_QUEUE } from "./queue.constants";

describe("NotificationPublisher", () => {
  let publisher: NotificationPublisher;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: "job-1" }) };

    const module = await Test.createTestingModule({
      providers: [
        NotificationPublisher,
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockQueue },
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

    expect(mockQueue.add).toHaveBeenCalledWith("registration.confirmed", {
      registrationId: "reg-1",
      studentId: "stu-1",
      workshopId: "ws-1",
    });
  });

  it("does not throw when the queue rejects", () => {
    mockQueue.add.mockRejectedValue(new Error("Redis down"));

    expect(() => publisher.fire("registration.confirmed", {})).not.toThrow();
  });
});
