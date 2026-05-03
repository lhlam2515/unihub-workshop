import { Readable } from "node:stream";

import { Test, type TestingModule } from "@nestjs/testing";

import { workshopErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { StorageService } from "@/shared/storage/storage.service";

import { DocumentsService } from "./documents.service";
import { AiSummaryResponseBuilder } from "../dto/ai-summary-response.dto";
import { DocumentResponseBuilder } from "../dto/document-response.dto";
import { AiSummariesRepository } from "../repositories/ai-summaries.repository";
import { WorkshopDocumentsRepository } from "../repositories/workshop-documents.repository";
import { WorkshopsRepository } from "../repositories/workshops.repository";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockWorkshopRow = {
  workshops: {
    workshopId: "w-001",
    title: "Test Workshop",
    status: "PUBLISHED" as const,
  },
  speakers: null,
  rooms: null,
};

const mockDocumentEntity = {
  documentId: "doc-001",
  workshopId: "w-001",
  fileUrl: "https://storage.example.com/workshops/w-001/doc.pdf",
  originalName: "presentation.pdf" as string | null,
  fileSizeBytes: 102400 as number | null,
  uploadStatus: "UPLOADED" as const,
  uploadedBy: "u-001",
  uploadedAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date(),
};

const mockAiSummaryEntity = {
  summaryId: "sum-001",
  documentId: "doc-001",
  workshopId: "w-001",
  status: "DONE" as const,
  summaryText: "AI summary text",
  modelUsed: "gpt-4",
  rawText: null,
  generatedAt: new Date("2026-05-01T00:00:00Z"),
  createdAt: new Date(),
  errorMessage: null,
};

const mockFile: Express.Multer.File = {
  buffer: Buffer.from("test file content"),
  originalname: "presentation.pdf",
  mimetype: "application/pdf",
  size: 102400,
  fieldname: "file",
  encoding: "7bit",
  destination: "",
  filename: "",
  path: "",
  stream: new Readable(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("DocumentsService", () => {
  let service: DocumentsService;
  let documentsRepo: jest.Mocked<WorkshopDocumentsRepository>;
  let workshopsRepo: jest.Mocked<WorkshopsRepository>;
  let aiSummariesRepo: jest.Mocked<AiSummariesRepository>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: WorkshopDocumentsRepository,
          useValue: {
            findById: jest.fn(),
            findByWorkshopId: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: WorkshopsRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: AiSummariesRepository,
          useValue: {
            findByWorkshopId: jest.fn(),
            findByDocumentId: jest.fn(),
            upsert: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
            deleteFile: jest.fn(),
            getFileStream: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    documentsRepo = module.get(WorkshopDocumentsRepository);
    workshopsRepo = module.get(WorkshopsRepository);
    aiSummariesRepo = module.get(AiSummariesRepository);
    storageService = module.get(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // uploadDocument
  // ---------------------------------------------------------------------------
  describe("uploadDocument", () => {
    it("uploads file and creates document with AI summary trigger (FR-F03-001)", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.ok(mockWorkshopRow as any)
      );
      storageService.uploadFile.mockResolvedValue(
        Result.ok("https://storage.example.com/key")
      );
      documentsRepo.create.mockResolvedValue(Result.ok(mockDocumentEntity));
      aiSummariesRepo.upsert.mockResolvedValue(Result.ok(mockAiSummaryEntity));

      const result = await service.uploadDocument("w-001", mockFile, "u-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual(
          DocumentResponseBuilder.from(mockDocumentEntity)
        );
      }
      expect(storageService.uploadFile).toHaveBeenCalledWith(mockFile, "w-001");
      expect(aiSummariesRepo.upsert).toHaveBeenCalledWith(
        mockDocumentEntity.documentId,
        "w-001"
      );
    });

    it("fails when workshop does not exist", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.fail({ code: "WORKSHOP_NOT_FOUND" } as any)
      );

      const result = await service.uploadDocument(
        "nonexistent",
        mockFile,
        "u-001"
      );

      expect(result.isFailure).toBe(true);
    });

    it("fails when storage upload fails", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.ok(mockWorkshopRow as any)
      );
      storageService.uploadFile.mockResolvedValue(
        Result.fail({ code: "UPLOAD_FAILED" } as any)
      );

      const result = await service.uploadDocument("w-001", mockFile, "u-001");

      expect(result.isFailure).toBe(true);
    });

    it("fails when document DB insert fails", async () => {
      workshopsRepo.findById.mockResolvedValue(
        Result.ok(mockWorkshopRow as any)
      );
      storageService.uploadFile.mockResolvedValue(
        Result.ok("https://example.com/key")
      );
      documentsRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.uploadDocument("w-001", mockFile, "u-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // listDocuments
  // ---------------------------------------------------------------------------
  describe("listDocuments", () => {
    it("returns documents for a workshop", async () => {
      documentsRepo.findByWorkshopId.mockResolvedValue(
        Result.ok([mockDocumentEntity])
      );

      const result = await service.listDocuments("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([
          DocumentResponseBuilder.from(mockDocumentEntity),
        ]);
      }
    });

    it("returns empty array when no documents", async () => {
      documentsRepo.findByWorkshopId.mockResolvedValue(Result.ok([]));

      const result = await service.listDocuments("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([]);
      }
    });

    it("proxies repository failure", async () => {
      documentsRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.listDocuments("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteDocument
  // ---------------------------------------------------------------------------
  describe("deleteDocument", () => {
    it("deletes a document and calls storage delete fire-and-forget", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(mockDocumentEntity));
      documentsRepo.delete.mockResolvedValue(Result.ok(mockDocumentEntity));
      storageService.deleteFile.mockResolvedValue(Result.ok());

      const result = await service.deleteDocument("w-001", "doc-001");

      expect(result.isSuccess).toBe(true);
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        mockDocumentEntity.fileUrl
      );
    });

    it("fails when document does not exist", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.deleteDocument("w-001", "nonexistent");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(workshopErrors.notFound("nonexistent"));
    });

    it("fails when findById returns failure", async () => {
      documentsRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.deleteDocument("w-001", "doc-001");

      expect(result.isFailure).toBe(true);
    });

    it("fails when document belongs to a different workshop", async () => {
      documentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockDocumentEntity, workshopId: "w-002" })
      );

      const result = await service.deleteDocument("w-001", "doc-001");

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(workshopErrors.notFound("doc-001"));
    });

    it("proxies delete failure", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(mockDocumentEntity));
      documentsRepo.delete.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.deleteDocument("w-001", "doc-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getAiSummary
  // ---------------------------------------------------------------------------
  describe("getAiSummary", () => {
    it("returns the public AI summary when found", async () => {
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.ok([mockAiSummaryEntity])
      );

      const result = await service.getAiSummary("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual(
          AiSummaryResponseBuilder.fromPublic(mockAiSummaryEntity)
        );
      }
    });

    it("returns { status: 'NONE' } when no summary exists", async () => {
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(Result.ok([]));

      const result = await service.getAiSummary("w-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual({ status: "NONE" });
      }
    });

    it("proxies repository failure", async () => {
      aiSummariesRepo.findByWorkshopId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.getAiSummary("w-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // retryAiSummary
  // ---------------------------------------------------------------------------
  describe("retryAiSummary", () => {
    it("resets status to PENDING when summary is FAILED", async () => {
      const failedSummary = {
        ...mockAiSummaryEntity,
        status: "FAILED" as const,
      };
      aiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.ok(failedSummary)
      );
      aiSummariesRepo.updateStatus.mockResolvedValue(
        Result.ok({ ...failedSummary, status: "PENDING" })
      );

      const result = await service.retryAiSummary("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(aiSummariesRepo.updateStatus).toHaveBeenCalledWith(
        "sum-001",
        "PENDING"
      );
    });

    it("no-op when summary status is not FAILED", async () => {
      const processingSummary = {
        ...mockAiSummaryEntity,
        status: "PENDING" as const,
      };
      aiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.ok(processingSummary)
      );

      const result = await service.retryAiSummary("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(aiSummariesRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("no-op when no summary record exists", async () => {
      aiSummariesRepo.findByDocumentId.mockResolvedValue(Result.ok(null));

      const result = await service.retryAiSummary("doc-001");

      expect(result.isSuccess).toBe(true);
      expect(aiSummariesRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("proxies find failure", async () => {
      aiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.retryAiSummary("doc-001");

      expect(result.isFailure).toBe(true);
    });

    it("proxies update failure", async () => {
      const failedSummary = {
        ...mockAiSummaryEntity,
        status: "FAILED" as const,
      };
      aiSummariesRepo.findByDocumentId.mockResolvedValue(
        Result.ok(failedSummary)
      );
      aiSummariesRepo.updateStatus.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.retryAiSummary("doc-001");

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getDocumentStream
  // ---------------------------------------------------------------------------
  describe("getDocumentStream", () => {
    const mockStream = new Readable();

    it("returns file stream when document is found", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(mockDocumentEntity));
      storageService.getFileStream.mockResolvedValue(Result.ok(mockStream));

      const result = await service.getDocumentStream("w-001", "doc-001");

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.stream).toBe(mockStream);
        expect(result.data.filename).toBe("presentation.pdf");
        expect(result.data.mimeType).toBe("application/pdf");
      }
    });

    it("fails when document does not exist", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.getDocumentStream("w-001", "nonexistent");

      expect(result.isFailure).toBe(true);
    });

    it("fails when document belongs to a different workshop", async () => {
      documentsRepo.findById.mockResolvedValue(
        Result.ok({ ...mockDocumentEntity, workshopId: "w-002" })
      );

      const result = await service.getDocumentStream("w-001", "doc-001");

      expect(result.isFailure).toBe(true);
    });

    it("fails when storage download fails", async () => {
      documentsRepo.findById.mockResolvedValue(Result.ok(mockDocumentEntity));
      storageService.getFileStream.mockResolvedValue(
        Result.fail({ code: "STORAGE_DOWNLOAD_FAILED" } as any)
      );

      const result = await service.getDocumentStream("w-001", "doc-001");

      expect(result.isFailure).toBe(true);
    });
  });
});
