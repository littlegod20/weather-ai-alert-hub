import type { Redis } from "ioredis";
import { env } from "../config/env";

export interface WeatherCacheKeyParams {
  lat: number;
  lon: number;
  units?: string;
  days?: number;
}

const KEY_PREFIX = "weatherai:cache:v1";

function roundCoord(value: number): string {
  return value.toFixed(4);
}

export function buildCacheKey({ lat, lon, units = "metric", days }: WeatherCacheKeyParams): string {
  const parts = [KEY_PREFIX, roundCoord(lat), roundCoord(lon), units];
  if (days !== undefined) parts.push(String(days));
  return parts.join(":");
}

export class WeatherCache {
  private readonly client: Redis;
  private readonly ttlSeconds: number;

  constructor(client: Redis, ttlSeconds: number = env.WEATHER_CACHE_TTL_SECONDS) {
    this.client = client;
    this.ttlSeconds = ttlSeconds;
  }

  async get<T>(params: WeatherCacheKeyParams): Promise<T | null> {
    const raw = await this.client.get(buildCacheKey(params));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(params: WeatherCacheKeyParams, value: T, ttlSeconds = this.ttlSeconds): Promise<void> {
    await this.client.set(buildCacheKey(params), JSON.stringify(value), "EX", ttlSeconds);
  }
}