import { describe, it, expect, beforeEach } from "vitest";
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
  let redis: any;

  beforeEach(async () => {
    if (!redis) redis = new RedisMock();
    await redis.flushall();
  });

  describe("self-tracked mode (the real path against WeatherAI's Free tier, which sends no quota headers)", () => {
    it("reports full quota with zero requests recorded", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      const state = await tracker.getState();
      expect(state).toEqual({ limit: 1000, remaining: 1000, resetAt: expect.any(Number), source: "self-tracked" });
    });

    it("decrements remaining as requests are recorded", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      await tracker.recordRequest();
      await tracker.recordRequest();
      await tracker.recordRequest();
      const state = await tracker.getState();
      expect(state.remaining).toBe(997);
      expect(state.source).toBe("self-tracked");
    });

    it("has headroom while comfortably under the limit", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      await tracker.recordRequest();
      expect(await tracker.hasHeadroom()).toBe(true);
    });

    it("denies headroom once remaining drops within the safety buffer", async () => {
      const tracker = new QuotaTracker(redis, 5, 10);
      for (let i = 0; i < 6; i++) await tracker.recordRequest();
      expect(await tracker.hasHeadroom()).toBe(false);
    });

    it("never reports negative remaining if somehow over-recorded", async () => {
      const tracker = new QuotaTracker(redis, 0, 2);
      for (let i = 0; i < 5; i++) await tracker.recordRequest();
      const state = await tracker.getState();
      expect(state.remaining).toBe(0);
    });

    it("resets on a new calendar month (different Redis key)", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      const augustDate = new Date(Date.UTC(2026, 7, 20));
      const septemberDate = new Date(Date.UTC(2026, 8, 1));

      await tracker.recordRequest(augustDate);
      await tracker.recordRequest(augustDate);

      const augustState = await tracker.getState(augustDate);
      const septemberState = await tracker.getState(septemberDate);

      expect(augustState.remaining).toBe(998);
      expect(septemberState.remaining).toBe(1000);
    });
  });

  describe("header mode (defensive path, in case a plan ever sends X-RateLimit-* headers)", () => {
    it("takes priority over the self-tracked count while still within its window", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      await tracker.recordRequest();
      const future = Math.floor(Date.now() / 1000) + 3600;
      await tracker.recordFromHeaders(
        new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "30", "X-RateLimit-Reset": String(future) })
      );
      const state = await tracker.getState();
      expect(state).toEqual({ limit: 1000, remaining: 30, resetAt: future, source: "headers" });
    });

    it("denies headroom once remaining drops within the safety buffer", async () => {
      const tracker = new QuotaTracker(redis, 20);
      const future = Math.floor(Date.now() / 1000) + 3600;
      await tracker.recordFromHeaders(
        new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "15", "X-RateLimit-Reset": String(future) })
      );
      expect(await tracker.hasHeadroom()).toBe(false);
    });

    it("falls back to self-tracked once the header-reported window has passed", async () => {
      const tracker = new QuotaTracker(redis, 20, 1000);
      const past = Math.floor(Date.now() / 1000) - 10;
      await tracker.recordFromHeaders(
        new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(past) })
      );
      const state = await tracker.getState();
      expect(state.source).toBe("self-tracked");
      expect(state.remaining).toBe(1000);
    });
  });
});