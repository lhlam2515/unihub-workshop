import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "@/shared/decorators/public.decorator";

import { SpeakersService } from "../services/speakers.service";

@Controller("speakers")
export class SpeakersPublicController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get(":speakerId")
  @Public()
  async getSpeaker(@Param("speakerId") speakerId: string) {
    return this.speakersService.getSpeakerById(speakerId);
  }
}
