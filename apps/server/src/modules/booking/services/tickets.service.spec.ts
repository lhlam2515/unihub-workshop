import { Test } from "@nestjs/testing";

import { TokenService } from "@/modules/iam/services/token.service";
import { Result } from "@/shared/response/result";

import { TicketsService } from "./tickets.service";
import { TicketsRepository } from "../repositories/tickets.repository";

describe("TicketsService", () => {
  let service: TicketsService;
  let ticketsRepo: jest.Mocked<TicketsRepository>;
  let tokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    ticketsRepo = {
      updateQrToken: jest.fn().mockResolvedValue(Result.ok({} as any)),
    } as any;

    tokenService = {
      signQrToken: jest.fn().mockReturnValue("signed-jwt-token"),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: TicketsRepository, useValue: ticketsRepo },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  describe("signAndUpdateQrToken", () => {
    it("signs QR token with ticket metadata and persists it", async () => {
      await service.signAndUpdateQrToken("ticket-1", "ws-1", "stu-1");

      expect(tokenService.signQrToken).toHaveBeenCalledWith({
        ticket_id: "ticket-1",
        workshop_id: "ws-1",
        student_id: "stu-1",
      });
      expect(ticketsRepo.updateQrToken).toHaveBeenCalledWith(
        "ticket-1",
        "signed-jwt-token"
      );
    });
  });
});
