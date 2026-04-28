/**
 * Speakers Service
 *
 * - listSpeakers()
 * - createSpeaker(dto)
 */

import { Injectable } from '@nestjs/common';

import { SpeakersRepository } from '../repositories/speakers.repository';

@Injectable()
export class SpeakersService {
  constructor(private readonly speakersRepo: SpeakersRepository) {}

  async listSpeakers() {
    // TODO: Implement
  }

  async createSpeaker(dto: any) {
    // TODO: Implement
  }
}
