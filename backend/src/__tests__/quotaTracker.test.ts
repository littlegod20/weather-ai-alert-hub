import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
import { QuotaTracker, parseRateLimitHeaders } from "../lib/quotaTracker";

describe("parseRateLimitHeaders", () => {
  it("parses valid headers from a Headers object", () => {
    const headers = new Headers({
      "X-RateLimit-Limit": "50000",
      "X-RateLimit-Remaining": "49987",
      "X-RateLimit-Reset": "1717977600",
    });
    expect(parseRateLimitHeaders(headers)).toEqual({ limit: 50000, remaining: 49987, resetAt: 1717977600 });
  });

  it("returns null when headers are missing", () => {
    expect(parseRateLimitHeaders(new Headers())).toBeNull();
  });

  it("returns null on malformed numeric values", () => {
    const headers = new Headers({
      "X-RateLimit-Limit": "not-a-number",
      "X-RateLimit-Remaining": "49987",
      "X-RateLimit-Reset": "1717977600",
    });
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });
});

describe("QuotaTracker", () => {
  it("is optimistic before any quota state is known", async () => {
    const tracker = new QuotaTracker(new RedisMock() as any, 20);
    expect(await tracker.hasHeadroom()).toBe(true);
  });

  it("records quota state from headers", async () => {
    const tracker = new QuotaTracker(new RedisMock() as any, 20);
    const future = Math.floor(Date.now() / 1000) + 3600;
    await tracker.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "30", "X-RateLimit-Reset": String(future) })
    );
    expect(await tracker.getState()).toEqual({ limit: 1000, remaining: 30, resetAt: future });
  });

  it("denies headroom once remaining drops within the safety buffer", async () => {
    const tracker = new QuotaTracker(new RedisMock() as any, 20);
    const future = Math.floor(Date.now() / 1000) + 3600;
    await tracker.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "15", "X-RateLimit-Reset": String(future) })
    );
    expect(await tracker.hasHeadroom()).toBe(false);
  });

  it("treats a rolled-over reset window as fresh headroom", async () => {
    const tracker = new QuotaTracker(new RedisMock() as any, 20);
    const past = Math.floor(Date.now() / 1000) - 10;
    await tracker.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(past) })
    );
    expect(await tracker.hasHeadroom()).toBe(true);
  });
});