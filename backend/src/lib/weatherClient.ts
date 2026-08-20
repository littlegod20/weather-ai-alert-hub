import { getEnv } from "../config/env";
import { logger } from "./logger";
import { getCachedWeather, setCachedWeather } from "./weatherCache";
import { canIssueRequest, parseRateLimitHeaders, saveQuota } from "./quotaTracker";
import {
  QuotaExceededError,
  WeatherApiError,
  type Units,
  type WeatherFetchResult,
  type WeatherPayload,
  type WeatherQuery,
} from "./weatherTypes";

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function weatherUrl(query: WeatherQuery, units: Units): string {
  const url = new URL("/v1/weather", getEnv().WEATHERAI_BASE_URL);
  url.searchParams.set("lat", String(query.lat));
  url.searchParams.set("lon", String(query.lon));
  url.searchParams.set("units", units);
  url.searchParams.set("ai", query.ai === true ? "true" : "false");
  if (query.days != null) url.searchParams.set("days", String(query.days));
  return url.toString();
}

async function fetchWithBackoff(url: string): Promise<Response> {
  const headers = { Authorization: `Bearer ${getEnv().WEATHERAI_API_KEY}` };
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    lastResponse = response;
    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      return response;
    }
    const delayMs = Math.min(500 * 2 ** attempt, 8000);
    logger.warn({ status: response.status, attempt: attempt + 1, delayMs }, "WeatherAI retry");
    await sleep(delayMs);
  }

  return lastResponse as Response;
}

/**
 * Cache- and quota-aware WeatherAI client.
 *
 * Payload fields are left untyped until a live `/v1/weather` body is captured.
 * HTTP, retry/backoff, cache, and quota gating do not depend on that shape.
 */
export async function getWeather(query: WeatherQuery): Promise<WeatherFetchResult> {
  const units: Units = query.units ?? "metric";
  const cached = await getCachedWeather(query.lat, query.lon, units);
  if (cached != null) {
    return { source: "cache", payload: cached, quota: null };
  }

  const gate = await canIssueRequest();
  if (!gate.allowed && gate.quota) {
    throw new QuotaExceededError(gate.quota);
  }

  const response = await fetchWithBackoff(weatherUrl(query, units));
  const quota = parseRateLimitHeaders(response.headers);
  if (quota) await saveQuota(quota);

  const body: WeatherPayload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new WeatherApiError(response.status, body);
  }

  await setCachedWeather(query.lat, query.lon, units, body);
  return { source: "network", payload: body, quota };
}
