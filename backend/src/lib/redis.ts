import Redis from "ioredis";
import { env } from "../config/env";

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
}

export const redis = createRedisClient();