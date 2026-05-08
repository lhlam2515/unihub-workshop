import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";

import { SpeakersService } from "../services/speakers.service";

@Controller("speakers")
export class SpeakersPublicController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get(":id")
  @Public()
  async getSpeaker(@Param("id") id: string) {
    return this.speakersService.getSpeakerById(id);
  }
}
