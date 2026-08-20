import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { WeatherCache } from "../lib/weatherCache";
import { QuotaTracker } from "../lib/quotaTracker";
import { WeatherAiClient } from "../lib/weatherClient";
import { WeatherApiError, WeatherApiValidationError, QuotaExceededError } from "../lib/weatherErrors";
import type { WeatherApiResponse } from "../lib/weatherTypes";

const sampleResponse: WeatherApiResponse = {
  lat: -1.2921,
  lon: 36.8219,
  units: "metric",
  days: 7,
  current: {
    time: "2026-08-20T16:00",
    interval: 900,
    temperature: 24,
    windspeed: 13.3,
    winddirection: 62,
    is_day: 1,
    weathercode: 3,
  },
  daily: [{ date: "2026-08-20", temp_max: 25.1, temp_min: 13.1, precipitation: 0.2, weathercode: 51 }],
  hourly: [{ time: "2026-08-20T00:00", temp: 16.4, precipitation: 0, weathercode: 3 }],
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function makeClient(fetchImpl: any, opts: { redis: any; sleep?: any }) {
  const redis = opts.redis;
  const cache = new WeatherCache(redis, 1500);
  const quota = new QuotaTracker(redis, 20);
  const sleep = opts.sleep ?? vi.fn().mockResolvedValue(undefined);
  const client = new WeatherAiClient(cache, quota, {
    apiKey: "wai_test_key",
    baseUrl: "https://api.weather-ai.co",
    fetchImpl,
    sleep,
  });
  return { client, redis, cache, quota, sleep };
}

describe("WeatherAiClient", () => {
  // ioredis-mock shares one in-memory dataset across every `new RedisMock()`
  // instance by default, so without this, cache entries from one test (same
  // lat/lon key throughout) would leak into the next and mask real behavior.
  let redis: any;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
  });

  it("fetches fresh on a cold cache and caches the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sampleResponse));
    const { client, cache } = makeClient(fetchImpl, { redis });

    const result = await client.getWeather({ lat: -1.2921, lon: 36.8219 });

    expect(result.cacheHit).toBe(false);
    expect(result.data.current.temperature).toBe(24);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const cached = await cache.get({ lat: -1.2921, lon: 36.8219 });
    expect(cached).not.toBeNull();
  });

  it("serves from cache on a second call and makes no network request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sampleResponse));
    const { client } = makeClient(fetchImpl, { redis });

    await client.getWeather({ lat: -1.2921, lon: 36.8219 });
    const second = await client.getWeather({ lat: -1.2921, lon: 36.8219 });

    expect(second.cacheHit).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // not called again
  });

  it("records quota state from response headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(sampleResponse, 200, {
        "X-RateLimit-Limit": "1000",
        "X-RateLimit-Remaining": "42",
        "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
      })
    );
    const { client, quota } = makeClient(fetchImpl, { redis });

    await client.getWeather({ lat: -1.2921, lon: 36.8219 });

    const state = await quota.getState();
    expect(state?.remaining).toBe(42);
  });

  it("refuses to call the API when quota headroom is exhausted, and never touches the network", async () => {
    const fetchImpl = vi.fn();
    const { client, quota } = makeClient(fetchImpl, { redis });

    const past = Math.floor(Date.now() / 1000) + 3600;
    await quota.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "5", "X-RateLimit-Reset": String(past) })
    );

    await expect(client.getWeather({ lat: -1.2921, lon: 36.8219 })).rejects.toThrow(QuotaExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries on 429 and succeeds on the next attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(sampleResponse));
    const { client, sleep } = makeClient(fetchImpl, { redis });

    const result = await client.getWeather({ lat: -1.2921, lon: 36.8219 });

    expect(result.cacheHit).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_RETRIES on repeated 500s", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const { client } = makeClient(fetchImpl, { redis });

    await expect(client.getWeather({ lat: -1.2921, lon: 36.8219 })).rejects.toThrow(WeatherApiError);
    // 1 initial + 3 retries = 4 total attempts
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry on a non-retryable 401 and fails immediately", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const { client } = makeClient(fetchImpl, { redis });

    await expect(client.getWeather({ lat: -1.2921, lon: 36.8219 })).rejects.toThrow(WeatherApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws WeatherApiValidationError when the response doesn't match the schema", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ lat: -1.29, lon: 36.8 })); // missing current/daily/hourly
    const { client } = makeClient(fetchImpl, { redis });

    await expect(client.getWeather({ lat: -1.2921, lon: 36.8219 })).rejects.toThrow(WeatherApiValidationError);
  });
});