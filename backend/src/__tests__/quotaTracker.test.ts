/// <reference types="vitest/globals" />
import RedisMock from "ioredis-mock";
import { getEnv, loadEnv, resetEnv } from "../config/env";
import {
  canIssueRequest,
  getQuota,
  hasQuotaHeadroom,
  parseRateLimitHeaders,
  saveQuota,
} from "../lib/quotaTracker";
import { setRedis } from "../lib/redis";
import type { QuotaState } from "../lib/weatherTypes";

function quota(overrides: Partial<QuotaState> = {}): QuotaState {
  return {
    limit: 1000,
    remaining: 50,
    resetAt: Math.floor(Date.now() / 1000) + 86_400,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("quotaTracker", () => {
  beforeEach(() => {
    resetEnv();
    loadEnv();
    setRedis(new RedisMock());
  });

  it("parses X-RateLimit headers from a Headers object", () => {
    const headers = new Headers({
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "987",
      "X-RateLimit-Reset": "1717977600",
    });

    expect(parseRateLimitHeaders(headers, new Date("2026-01-01T00:00:00.000Z"))).toEqual({
      limit: 1000,
      remaining: 987,
      resetAt: 1717977600,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("parses headers case-insensitively from a plain object", () => {
    const parsed = parseRateLimitHeaders({
      "x-ratelimit-limit": "1000",
      "X-RATELIMIT-REMAINING": "12",
      "X-RateLimit-Reset": "1717977600",
    });

    expect(parsed).toMatchObject({ limit: 1000, remaining: 12, resetAt: 1717977600 });
  });

  it("returns null when any rate-limit header is missing", () => {
    expect(
      parseRateLimitHeaders({
        "X-RateLimit-Limit": "1000",
        "X-RateLimit-Remaining": "10",
      }),
    ).toBeNull();
  });

  it("allows a request when no quota has been observed yet", async () => {
    await expect(canIssueRequest()).resolves.toEqual({ allowed: true, quota: null });
  });

  it("allows a request when remaining is above the safety buffer", () => {
    expect(hasQuotaHeadroom(quota({ remaining: 21 }), 20)).toBe(true);
  });

  it("refuses a request when remaining is within the safety buffer", () => {
    expect(hasQuotaHeadroom(quota({ remaining: 20 }), 20)).toBe(false);
    expect(hasQuotaHeadroom(quota({ remaining: 0 }), 20)).toBe(false);
  });

  it("allows a request once the reset epoch is in the past", () => {
    const resetAt = Math.floor(Date.now() / 1000) - 10;
    expect(hasQuotaHeadroom(quota({ remaining: 0, resetAt }), 20)).toBe(true);
  });

  it("round-trips quota state through Redis", async () => {
    const state = quota({ remaining: 42, resetAt: Math.floor(Date.now() / 1000) + 3600 });
    await saveQuota(state);

    await expect(getQuota()).resolves.toEqual(state);
    await expect(canIssueRequest()).resolves.toEqual({ allowed: true, quota: state });
  });

  it("uses QUOTA_SAFETY_BUFFER from env when gating Redis state", async () => {
    const previous = process.env.QUOTA_SAFETY_BUFFER;
    process.env.QUOTA_SAFETY_BUFFER = "30";
    resetEnv();
    loadEnv();
    expect(getEnv().QUOTA_SAFETY_BUFFER).toBe(30);

    try {
      await saveQuota(quota({ remaining: 30 }));
      await expect(canIssueRequest()).resolves.toMatchObject({ allowed: false });

      await saveQuota(quota({ remaining: 31 }));
      await expect(canIssueRequest()).resolves.toMatchObject({ allowed: true });
    } finally {
      process.env.QUOTA_SAFETY_BUFFER = previous;
      resetEnv();
    }
  });
});
