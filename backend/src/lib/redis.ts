import Redis from "ioredis";
import { getEnv } from "../config/env";

export type RedisClient = Pick<Redis, "get" | "set" | "del" | "quit">;

let client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!client) {
    client = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });
  }
  return client;
}

export function setRedis(instance: RedisClient): void {
  client = instance;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
}
