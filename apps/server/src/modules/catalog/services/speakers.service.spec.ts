import { Test, type TestingModule } from "@nestjs/testing";
import { speakerErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";
import { SpeakerResponseBuilder } from "../dto/speaker-response.dto";
import { SpeakersRepository } from "../repositories/speakers.repository";
import { SpeakersService } from "./speakers.service";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSpeakerEntity = {
  speakerId: "s-001",
  fullName: "John Doe",
  title: "Expert Speaker",
  bio: "An experienced speaker",
  avatarUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockSpeakerDto = SpeakerResponseBuilder.from(mockSpeakerEntity);

const createDto = {
  full_name: "John Doe",
  title: "Expert Speaker",
  bio: "An experienced speaker",
  avatar_url: undefined,
};

const updateDto = { full_name: "Jane Doe" };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SpeakersService", () => {
  let service: SpeakersService;
  let speakersRepo: jest.Mocked<SpeakersRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpeakersService,
        {
          provide: SpeakersRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SpeakersService>(SpeakersService);
    speakersRepo = module.get(SpeakersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // listSpeakers
  // ---------------------------------------------------------------------------
  describe("listSpeakers", () => {
    it("returns all speakers as DTOs", async () => {
      speakersRepo.findAll.mockResolvedValue(Result.ok([mockSpeakerEntity]));

      const result = await service.listSpeakers();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual([mockSpeakerDto]);
      }
    });

    it("proxies repository failure", async () => {
      speakersRepo.findAll.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.listSpeakers();

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createSpeaker
  // ---------------------------------------------------------------------------
  describe("createSpeaker", () => {
    it("creates a speaker and returns its DTO", async () => {
      speakersRepo.create.mockResolvedValue(Result.ok(mockSpeakerEntity));

      const result = await service.createSpeaker(createDto as any);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data).toEqual(mockSpeakerDto);
      }
      expect(speakersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "John Doe",
          title: "Expert Speaker",
          bio: "An experienced speaker",
        })
      );
    });

    it("sets null for optional fields when not provided", async () => {
      speakersRepo.create.mockResolvedValue(Result.ok(mockSpeakerEntity));
      const dtoMinimal = { full_name: "John Doe" };

      await service.createSpeaker(dtoMinimal as any);

      expect(speakersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "John Doe",
          title: null,
          bio: null,
          avatarUrl: null,
        })
      );
    });

    it("proxies repository failure", async () => {
      speakersRepo.create.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.createSpeaker(createDto as any);

      expect(result.isFailure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateSpeaker
  // ---------------------------------------------------------------------------
  describe("updateSpeaker", () => {
    it("updates a speaker and returns its DTO", async () => {
      const updatedEntity = { ...mockSpeakerEntity, fullName: "Jane Doe" };
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeakerEntity));
      speakersRepo.update.mockResolvedValue(Result.ok(updatedEntity));

      const result = await service.updateSpeaker("s-001", updateDto as any);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.data.full_name).toBe("Jane Doe");
      }
    });

    it("fails when speaker does not exist", async () => {
      speakersRepo.findById.mockResolvedValue(Result.ok(null));

      const result = await service.updateSpeaker(
        "nonexistent",
        updateDto as any
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toEqual(speakerErrors.notFound("nonexistent"));
    });

    it("fails when findById returns failure", async () => {
      speakersRepo.findById.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateSpeaker("s-001", updateDto as any);

      expect(result.isFailure).toBe(true);
    });

    it("proxies update failure", async () => {
      speakersRepo.findById.mockResolvedValue(Result.ok(mockSpeakerEntity));
      speakersRepo.update.mockResolvedValue(
        Result.fail({ code: "INTERNAL_ERROR" } as any)
      );

      const result = await service.updateSpeaker("s-001", updateDto as any);

      expect(result.isFailure).toBe(true);
    });
  });
});
