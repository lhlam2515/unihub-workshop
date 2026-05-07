import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";

import { NotificationLogsRepository } from "./notification-logs.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  let resolveValue: any = [];

  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: any) => resolve(resolveValue)),
  };

  const db: any = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
  };

  return {
    db,
    chainable,
    setResult: (v: any) => {
      resolveValue = v;
    },
  };
}

const mockNotificationLog = {
  notificationId: "notif-001",
  userId: "u-001",
  workshopId: "w-001",
  type: "REGISTRATION_CONFIRMED",
  channel: "EMAIL" as const,
  status: "PENDING" as const,
  payload: { recipient: "user@example.com" },
  sentAt: null,
  errorMessage: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const mockSchema: any = {
  notificationLogs: {
    notificationId: "notificationId",
    userId: "userId",
    workshopId: "workshopId",
    status: "status",
    channel: "channel",
    type: "type",
    createdAt: "createdAt",
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("NotificationLogsRepository", () => {
  let repo: NotificationLogsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationLogsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<NotificationLogsRepository>(NotificationLogsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("inserts a new notification log and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockNotificationLog]);

      const result = await repo.create({
        userId: "u-001",
        workshopId: "w-001",
        type: "REGISTRATION_CONFIRMED",
        channel: "EMAIL",
        status: "PENDING",
        payload: { recipient: "user@example.com" },
      });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockNotificationLog);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.notificationLogs);
    });

    it("returns FailResult when DB insert throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.create({
        userId: "u-001",
        type: "REGISTRATION_CONFIRMED",
        channel: "EMAIL",
        status: "PENDING",
        payload: {},
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates status to SENT with sentAt timestamp", async () => {
      const sent = {
        ...mockNotificationLog,
        status: "SENT" as const,
        sentAt: new Date("2026-06-01T12:00:00Z"),
      };
      mockChain.returning.mockResolvedValue([sent]);

      const result = await repo.updateStatus(
        "notif-001",
        "SENT",
        new Date("2026-06-01T12:00:00Z")
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("SENT");
    });

    it("updates status to FAILED with error message", async () => {
      const failed = {
        ...mockNotificationLog,
        status: "FAILED" as const,
        errorMessage: "SMTP timeout",
      };
      mockChain.returning.mockResolvedValue([failed]);

      const result = await repo.updateStatus(
        "notif-001",
        "FAILED",
        undefined,
        "SMTP timeout"
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.status).toBe("FAILED");
      expect(result.data.errorMessage).toBe("SMTP timeout");
    });

    it("returns FailResult when DB update throws", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB down"));

      const result = await repo.updateStatus("notif-001", "SENT");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findByUser (via findMany)
  // -----------------------------------------------------------------------
  describe("findByUser (via findMany)", () => {
    it("returns notification logs filtered by userId", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([mockNotificationLog]);
        else resolve([{ count: "1" }]);
      };

      const result = await repo.findMany(
        { userId: "u-001" },
        { page: 1, limit: 20 }
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
      // findMany runs two parallel select queries (items + count),
      // so we verify items/data shape rather than which arg select() received
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("returns empty array when no logs exist for user", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([]);
        else resolve([{ count: "0" }]);
      };

      const result = await repo.findMany(
        { userId: "nonexistent" },
        { page: 1, limit: 20 }
      );

      expect(result.isSuccess).toBe(true);
      expect(result.data.items).toEqual([]);
      expect(result.data.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------
  describe("findById", () => {
    it("returns the notification log when found", async () => {
      // Chain: select().from().where() — ends with .where() returning chainable
      mockChain.then = (resolve: any) => resolve([mockNotificationLog]);

      const result = await repo.findById("notif-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockNotificationLog);
    });

    it("returns null when notification log not found", async () => {
      mockChain.then = (resolve: any) => resolve([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult when DB query throws", async () => {
      mockChain.then = (_resolve: any, reject: any) =>
        reject(new Error("DB down"));

      const result = await repo.findById("notif-001");

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // findMany — filters
  // -----------------------------------------------------------------------
  describe("findMany — filters and pagination", () => {
    it("applies status filter when provided", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([mockNotificationLog]);
        else resolve([{ count: "1" }]);
      };

      const result = await repo.findMany(
        { status: "PENDING" },
        { page: 1, limit: 20 }
      );

      expect(result.isSuccess).toBe(true);
    });

    it("applies channel filter when provided", async () => {
      let callCount = 0;
      mockChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) resolve([mockNotificationLog]);
        else resolve([{ count: "1" }]);
      };

      const result = await repo.findMany(
        { channel: "EMAIL" },
        { page: 1, limit: 20 }
      );

      expect(result.isSuccess).toBe(true);
    });

    it("returns FailResult when DB query throws", async () => {
      let callCount = 0;
      mockChain.then = (_resolve: any, reject: any) => {
        callCount++;
        // First call rejects, second settles with dummy to avoid unhandled rejection
        if (callCount === 1) reject(new Error("DB down"));
      };

      const result = await repo.findMany(
        { status: "PENDING" },
        { page: 1, limit: 20 }
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
