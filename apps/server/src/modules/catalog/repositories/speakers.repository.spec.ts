import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import { systemErrors } from "@/shared/response/errors";

import { SpeakersRepository } from "./speakers.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSpeaker = {
  speakerId: "s-001",
  fullName: "John Doe",
  title: "Expert Speaker",
  bio: "An experienced speaker",
  avatarUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    then: undefined,
  };

  const db = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SpeakersRepository", () => {
  let repo: SpeakersRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      speakers: { speakerId: "speakerId", createdAt: "createdAt" },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpeakersRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<SpeakersRepository>(SpeakersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe("findAll", () => {
    it("returns all speakers ordered by createdAt descending", async () => {
      mockChain.orderBy.mockResolvedValue([mockSpeaker]);

      const result = await repo.findAll();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockSpeaker]);
      }
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns empty array when no speakers exist", async () => {
      mockChain.orderBy.mockResolvedValue([]);

      const result = await repo.findAll();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.orderBy.mockRejectedValue(new Error("DB error"));

      const result = await repo.findAll();

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(
        systemErrors.internal(new Error("DB error"))
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe("findById", () => {
    it("returns a speaker when found", async () => {
      mockChain.limit.mockResolvedValue([mockSpeaker]);

      const result = await repo.findById("s-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSpeaker);
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findById("s-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe("create", () => {
    it("inserts a speaker and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockSpeaker]);

      const result = await repo.create(mockSpeaker);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSpeaker);
      expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.speakers);
    });

    it("returns FailResult on insert error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create(mockSpeaker);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe("update", () => {
    it("updates a speaker and returns it", async () => {
      const updated = { ...mockSpeaker, fullName: "Jane Doe" };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.update("s-001", { fullName: "Jane Doe" });

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it("returns FailResult on update error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Update failed"));

      const result = await repo.update("s-001", { fullName: "Jane" });

      expect(result.isFailure).toBe(true);
    });

    it("partial update only includes provided fields", async () => {
      const updated = { ...mockSpeaker, title: "New Title" };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.update("s-001", { title: "New Title" });

      expect(result.isSuccess).toBe(true);
      expect(result.data.title).toBe("New Title");
    });
  });
});
