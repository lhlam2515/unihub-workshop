import { Test } from "@nestjs/testing";

import { BullMQAdapter } from "./bullmq.adapter";
import { MESSAGING_TOKEN } from "./messaging.constants";
import { NotificationPublisher } from "./notification-publisher";

describe("NotificationPublisher", () => {
  let publisher: NotificationPublisher;
  let adapter: BullMQAdapter;

  beforeEach(async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue({ id: "job-1" }) };
    adapter = new BullMQAdapter(mockQueue as any);
    jest.spyOn(adapter, "enqueue");

    const module = await Test.createTestingModule({
      providers: [
        NotificationPublisher,
        { provide: MESSAGING_TOKEN.NOTIFICATION_QUEUE, useValue: adapter },
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

    expect(adapter.enqueue).toHaveBeenCalledWith("registration.confirmed", {
      registrationId: "reg-1",
      studentId: "stu-1",
      workshopId: "ws-1",
    });
  });

  it("does not throw when the queue rejects", () => {
    jest.spyOn(adapter, "enqueue").mockRejectedValue(new Error("Redis down"));

    expect(() => publisher.fire("registration.confirmed", {})).not.toThrow();
  });
});
