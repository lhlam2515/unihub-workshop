import { Test, type TestingModule } from "@nestjs/testing";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/database";

import { WorkshopDocumentsRepository } from "./workshop-documents.repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockDocument = {
  documentId: "doc-001",
  workshopId: "w-001",
  fileUrl: "https://storage.example.com/workshops/w-001/doc.pdf",
  originalName: "presentation.pdf",
  fileSizeBytes: 102400,
  uploadStatus: "UPLOADED" as const,
  uploadedBy: "u-001",
  uploadedAt: new Date("2026-05-01T00:00:00Z"),
};

function createMockDb() {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    then: undefined,
  };

  const db = {
    select: jest.fn().mockReturnValue(chainable),
    insert: jest.fn().mockReturnValue(chainable),
    update: jest.fn().mockReturnValue(chainable),
    delete: jest.fn().mockReturnValue(chainable),
  };

  return { db, chainable };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WorkshopDocumentsRepository", () => {
  let repo: WorkshopDocumentsRepository;
  let mockDb: ReturnType<typeof createMockDb>["db"];
  let mockChain: ReturnType<typeof createMockDb>["chainable"];
  let mockSchema: any;

  beforeEach(async () => {
    const { db, chainable } = createMockDb();
    mockDb = db;
    mockChain = chainable;
    mockSchema = {
      workshopDocuments: {
        documentId: "documentId",
        workshopId: "workshopId",
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkshopDocumentsRepository,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: DATABASE_SCHEMA, useValue: mockSchema },
      ],
    }).compile();

    repo = module.get<WorkshopDocumentsRepository>(WorkshopDocumentsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findByWorkshopId
  // ---------------------------------------------------------------------------
  describe("findByWorkshopId", () => {
    it("returns documents for a workshop", async () => {
      mockChain.where.mockResolvedValue([mockDocument]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockDocument]);
      }
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns empty array when no documents exist", async () => {
      mockChain.where.mockResolvedValue([]);

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("returns FailResult on DB error", async () => {
      mockChain.where.mockRejectedValue(new Error("DB error"));

      const result = await repo.findByWorkshopId("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe("findById", () => {
    it("returns a document when found", async () => {
      mockChain.limit.mockResolvedValue([mockDocument]);

      const result = await repo.findById("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockDocument);
    });

    it("returns null when not found", async () => {
      mockChain.limit.mockResolvedValue([]);

      const result = await repo.findById("nonexistent");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns FailResult on DB error", async () => {
      mockChain.limit.mockRejectedValue(new Error("DB error"));

      const result = await repo.findById("doc-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe("create", () => {
    it("inserts a document and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockDocument]);

      const result = await repo.create(mockDocument);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockDocument);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns FailResult on insert error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Insert failed"));

      const result = await repo.create(mockDocument);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------
  describe("updateStatus", () => {
    it("updates the upload status", async () => {
      const updated = { ...mockDocument, uploadStatus: "PROCESSING" };
      mockChain.returning.mockResolvedValue([updated]);

      const result = await repo.updateStatus("doc-001", "PROCESSING");

      expect(result.isSuccess).toBe(true);
      expect(result.data.uploadStatus).toBe("PROCESSING");
    });

    it("returns FailResult on DB error", async () => {
      mockChain.returning.mockRejectedValue(new Error("DB error"));

      const result = await repo.updateStatus("doc-001", "FAILED");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe("delete", () => {
    it("deletes a document and returns it", async () => {
      mockChain.returning.mockResolvedValue([mockDocument]);

      const result = await repo.delete("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockDocument);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("returns FailResult on delete error", async () => {
      mockChain.returning.mockRejectedValue(new Error("Delete failed"));

      const result = await repo.delete("doc-001");

      expect(result.isFailure).toBe(true);
    });
  });
});
