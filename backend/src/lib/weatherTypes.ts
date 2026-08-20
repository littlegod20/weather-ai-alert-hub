export const UNITS = ["metric", "imperial"] as const;
export type Units = (typeof UNITS)[number];

export const TRIGGER_TYPES = ["rain", "wind", "frost", "drought"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type WeatherQuery = {
  lat: number;
  lon: number;
  units?: Units;
  days?: number;
  /** WeatherAI includes Gemini summaries by default; we send false to preserve AI quota. */
  ai?: boolean;
};

/**
 * Opaque until a live GET /v1/weather body is captured and mapped.
 * Cache, quota, and HTTP plumbing do not depend on field names.
 */
export type WeatherPayload = unknown;

export type QuotaState = {
  limit: number;
  remaining: number;
  resetAt: number;
  updatedAt: string;
};

export type WeatherFetchResult = {
  source: "cache" | "network";
  payload: WeatherPayload;
  quota: QuotaState | null;
};

export class QuotaExceededError extends Error {
  readonly quota: QuotaState;

  constructor(quota: QuotaState) {
    super(
      `WeatherAI quota remaining (${quota.remaining}) is within the safety buffer; next reset at ${quota.resetAt}`,
    );
    this.name = "QuotaExceededError";
    this.quota = quota;
  }
}

export class WeatherApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`WeatherAI request failed with status ${status}`);
    this.name = "WeatherApiError";
    this.status = status;
    this.body = body;
  }
}
