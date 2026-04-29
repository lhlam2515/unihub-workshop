/**
 * Rooms Service
 *
 * - listRooms()
 * - createRoom(dto)
 */

import { Injectable } from "@nestjs/common";

import { RoomsRepository } from "../repositories/rooms.repository";

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepo: RoomsRepository) {}

  async listRooms() {
    // TODO: Implement
  }

  async createRoom(dto: any) {
    // TODO: Implement
  }
}
