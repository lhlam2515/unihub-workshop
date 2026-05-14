import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";

import { RoomsService } from "../services/rooms.service";

@Controller("rooms")
export class RoomsPublicController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get(":roomId")
  @Public()
  async getRoom(@Param("roomId") roomId: string) {
    return this.roomsService.getRoomById(roomId);
  }
}
