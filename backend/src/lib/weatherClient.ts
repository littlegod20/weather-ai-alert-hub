import { env } from "../config/env";
import { WeatherCache } from "./weatherCache";
import { QuotaTracker } from "./quotaTracker";
import { weatherApiResponseSchema, type WeatherApiResponse, type GetWeatherParams } from "./weatherTypes";
import { WeatherApiError, WeatherApiValidationError, QuotaExceededError } from "./weatherErrors";

export interface GetWeatherResult {
  data: WeatherApiResponse;
  cacheHit: boolean;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

export type FetchFn = typeof fetch;
export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class WeatherAiClient {
  private readonly cache: WeatherCache;
  private readonly quota: QuotaTracker;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchFn;
  private readonly sleep: SleepFn;

  constructor(
    cache: WeatherCache,
    quota: QuotaTracker,
    opts: { apiKey?: string; baseUrl?: string; fetchImpl?: FetchFn; sleep?: SleepFn } = {}
  ) {
    this.cache = cache;
    this.quota = quota;
    this.apiKey = opts.apiKey ?? env.WEATHERAI_API_KEY;
    this.baseUrl = opts.baseUrl ?? env.WEATHERAI_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async getWeather(params: GetWeatherParams): Promise<GetWeatherResult> {
    const cacheParams = { lat: params.lat, lon: params.lon, units: params.units, days: params.days };

    const cached = await this.cache.get<WeatherApiResponse>(cacheParams);
    if (cached) {
      return { data: cached, cacheHit: true };
    }

    return this.fetchFresh(params, cacheParams);
  }

  private async fetchFresh(
    params: GetWeatherParams,
    cacheParams: { lat: number; lon: number; units?: string; days?: number }
  ): Promise<GetWeatherResult> {
    const hasHeadroom = await this.quota.hasHeadroom();
    if (!hasHeadroom) {
      throw new QuotaExceededError();
    }

    const data = await this.requestWithRetry(params);
    await this.cache.set(cacheParams, data);
    return { data, cacheHit: false };
  }

  private buildUrl(params: GetWeatherParams): string {
    const url = new URL("/v1/weather", this.baseUrl);
    url.searchParams.set("lat", String(params.lat));
    url.searchParams.set("lon", String(params.lon));
    if (params.days !== undefined) url.searchParams.set("days", String(params.days));
    if (params.units !== undefined) url.searchParams.set("units", params.units);
    return url.toString();
  }

  private async requestWithRetry(params: GetWeatherParams, attempt = 0): Promise<WeatherApiResponse> {
    const response = await this.fetchImpl(this.buildUrl(params), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    await this.quota.recordFromHeaders(response.headers);

    if (response.ok) {
      const json = await response.json();
      const parsed = weatherApiResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new WeatherApiValidationError("WeatherAI response did not match the expected schema", parsed.error.issues);
      }
      return parsed.data;
    }

    const body = await response.text().catch(() => undefined);

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
      const backoff = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 100);
      await this.sleep(backoff);
      return this.requestWithRetry(params, attempt + 1);
    }

    throw new WeatherApiError(`WeatherAI request failed with status ${response.status}`, response.status, body);
  }
}