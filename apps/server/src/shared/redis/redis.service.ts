import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL!);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, exSeconds?: number): Promise<"OK"> {
    if (exSeconds !== undefined) {
      return this.client.set(key, value, "EX", exSeconds);
    }
    return this.client.set(key, value);
  }

  async setNx(
    key: string,
    value: string,
    exSeconds?: number
  ): Promise<boolean> {
    if (exSeconds !== undefined) {
      const result = await this.client.set(key, value, "EX", exSeconds, "NX");
      return result === "OK";
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async jsonGet<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async jsonSet(
    key: string,
    value: unknown,
    exSeconds?: number
  ): Promise<"OK"> {
    const serialized = JSON.stringify(value);
    if (exSeconds !== undefined) {
      return this.client.set(key, serialized, "EX", exSeconds);
    }
    return this.client.set(key, serialized);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
