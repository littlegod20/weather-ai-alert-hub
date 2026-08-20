import type { Redis } from "ioredis";
import { env } from "../config/env";

export interface QuotaState {
  limit: number;
  remaining: number;
  /** Unix epoch seconds when this window resets. */
  resetAt: number;
  /**
   * "headers" means WeatherAI told us directly (X-RateLimit-* response
   * headers) — authoritative when present. "self-tracked" means we're
   * counting our own requests against the documented plan cap, because
   * WeatherAI's Free tier sends no quota headers at all (confirmed against a
   * live response on 2026-08-20: only standard CDN/framework headers were
   * present, nothing rate-limit related). Self-tracked counts are an
   * approximation — it resets by calendar month (UTC), which may not exactly
   * match WeatherAI's real billing cycle, since that isn't exposed anywhere.
   */
  source: "headers" | "self-tracked";
}

const HEADER_STATE_KEY = "weatherai:quota:headers:v1";
const COUNT_KEY_PREFIX = "weatherai:quota:count:v1";
// 40 days: comfortably covers a full month plus timezone/clock-drift slop,
// so a counter key never survives to be misread as a later month's count.
const COUNT_KEY_TTL_SECONDS = 40 * 24 * 60 * 60;

interface HeaderQuotaState {
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Parses X-RateLimit-* headers, IF a plan/response ever sends them. Kept as a
 * defensive path (e.g. a future WeatherAI API version, or a paid tier) even
 * though the Free tier never sends these today — verified empirically, not
 * assumed from documentation.
 */
export function parseRateLimitHeaders(headers: Headers | Record<string, string | undefined>): HeaderQuotaState | null {
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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfNextUtcMonth(date: Date): number {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return Math.floor(next.getTime() / 1000);
}

export class QuotaTracker {
  private readonly client: Redis;
  private readonly safetyBuffer: number;
  private readonly monthlyLimit: number;

  constructor(
    client: Redis,
    safetyBuffer: number = env.QUOTA_SAFETY_BUFFER,
    monthlyLimit: number = env.WEATHERAI_MONTHLY_LIMIT
  ) {
    this.client = client;
    this.safetyBuffer = safetyBuffer;
    this.monthlyLimit = monthlyLimit;
  }

  /** No-op on WeatherAI's Free tier today; see the class doc above. */
  async recordFromHeaders(headers: Headers | Record<string, string | undefined>): Promise<void> {
    const parsed = parseRateLimitHeaders(headers);
    if (parsed) {
      await this.client.set(HEADER_STATE_KEY, JSON.stringify(parsed));
    }
  }

  /** Call once per real (non-cached) request actually sent to WeatherAI. */
  async recordRequest(now: Date = new Date()): Promise<void> {
    const key = `${COUNT_KEY_PREFIX}:${monthKey(now)}`;
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, COUNT_KEY_TTL_SECONDS);
    }
  }

  async getState(now: Date = new Date()): Promise<QuotaState> {
    const headerStateRaw = await this.client.get(HEADER_STATE_KEY);
    if (headerStateRaw) {
      try {
        const parsed = JSON.parse(headerStateRaw) as HeaderQuotaState;
        // Only trust it while still inside the window it claims to describe.
        if (Math.floor(now.getTime() / 1000) < parsed.resetAt) {
          return { ...parsed, source: "headers" };
        }
      } catch {
        // fall through to self-tracked
      }
    }

    const key = `${COUNT_KEY_PREFIX}:${monthKey(now)}`;
    const raw = await this.client.get(key);
    const count = raw ? Number(raw) : 0;

    return {
      limit: this.monthlyLimit,
      remaining: Math.max(this.monthlyLimit - count, 0),
      resetAt: startOfNextUtcMonth(now),
      source: "self-tracked",
    };
  }

  async hasHeadroom(now: Date = new Date()): Promise<boolean> {
    const state = await this.getState(now);
    return state.remaining - this.safetyBuffer > 0;
  }
}