import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { seatErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

@Injectable()
export class SeatCounterService {
  private readonly keyPrefix = "seat:available";

  constructor(private readonly redisService: RedisService) {}

  async initialize(workshopId: string, seatsTotal: number): Promise<void> {
    await this.redisService.set(
      `${this.keyPrefix}:${workshopId}`,
      String(seatsTotal)
    );
  }

  async getAvailable(workshopId: string): Promise<number> {
    const value = await this.redisService.get(
      `${this.keyPrefix}:${workshopId}`
    );
    return value !== null ? parseInt(value, 10) : 0;
  }

  async delete(workshopId: string): Promise<void> {
    await this.redisService.del(`${this.keyPrefix}:${workshopId}`);
  }

  async decrement(workshopId: string): Promise<Result<void>> {
    const key = `${this.keyPrefix}:${workshopId}`;
    const result = await this.redisService.decr(key);
    if (result < 0) {
      await this.redisService.incr(key);
      return Result.fail(seatErrors.unavailable(workshopId));
    }
    return Result.ok();
  }

  async increment(workshopId: string): Promise<number> {
    return this.redisService.incr(`${this.keyPrefix}:${workshopId}`);
  }
}
