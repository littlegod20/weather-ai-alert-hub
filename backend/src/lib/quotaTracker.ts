import type { Redis } from "ioredis";
import { env } from "../config/env";

export interface QuotaState {
  limit: number;
  remaining: number;
  resetAt: number;
}

const REDIS_KEY = "weatherai:quota:v1";

export function parseRateLimitHeaders(headers: Headers | Record<string, string | undefined>): QuotaState | null {
  const get = (name: string): string | undefined =>
    headers instanceof Headers ? headers.get(name) ?? undefined : headers[name] ?? headers[name.toLowerCase()];

  const limitRaw = get("X-RateLimit-Limit");
  const remainingRaw = get("X-RateLimit-Remaining");
  const resetRaw = get("X-RateLimit-Reset");

  if (limitRaw === undefined || remainingRaw === undefined || resetRaw === undefined) {
    return null;
  }

  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  const resetAt = Number(resetRaw);

  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || !Number.isFinite(resetAt)) {
    return null;
  }

  return { limit, remaining, resetAt };
}

export class QuotaTracker {
  private readonly client: Redis;
  private readonly safetyBuffer: number;

  constructor(client: Redis, safetyBuffer: number = env.QUOTA_SAFETY_BUFFER) {
    this.client = client;
    this.safetyBuffer = safetyBuffer;
  }

  async recordFromHeaders(headers: Headers | Record<string, string | undefined>): Promise<QuotaState | null> {
    const state = parseRateLimitHeaders(headers);
    if (state) {
      await this.client.set(REDIS_KEY, JSON.stringify(state));
    }
    return state;
  }

  async getState(): Promise<QuotaState | null> {
    const raw = await this.client.get(REDIS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as QuotaState;
    } catch {
      return null;
    }
  }

  async hasHeadroom(): Promise<boolean> {
    const state = await this.getState();
    if (!state) return true;

    const now = Math.floor(Date.now() / 1000);
    if (now >= state.resetAt) return true;

    return state.remaining - this.safetyBuffer > 0;
  }
}