import type { WeatherApiResponse } from "../lib/weatherTypes";

export type TriggerType = "RAIN" | "EXTREME_WIND" | "FROST" | "DROUGHT";

export interface TriggerMatch {
  triggerType: TriggerType;
  message: string;
  snapshot: Record<string, unknown>;
}

const RAIN_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

export const DEFAULT_EXTREME_WIND_THRESHOLD_KMH = 60; // ~gale force, WMO Beaufort 8
export const DEFAULT_FROST_THRESHOLD_C = 0;
export const DEFAULT_DROUGHT_MAX_PRECIPITATION_MM = 5; // across the full forecast horizon returned

export function isRainy(current: WeatherApiResponse["current"]): boolean {
  return RAIN_WEATHER_CODES.has(current.weathercode);
}

export function isExtremeWind(current: WeatherApiResponse["current"], thresholdKmh = DEFAULT_EXTREME_WIND_THRESHOLD_KMH): boolean {
  return current.windspeed >= thresholdKmh;
}

export function isFrost(current: WeatherApiResponse["current"], thresholdC = DEFAULT_FROST_THRESHOLD_C): boolean {
  return current.temperature <= thresholdC;
}

/**
 * IMPORTANT LIMITATION: WeatherAI's /v1/weather only returns forward-looking
 * forecasts, no historical precipitation on the Free tier. This is a
 * forward dry-spell check, not a true drought index, and says so in the
 * alert message rather than overclaiming.
 */
export function isDrySpellForecast(
  daily: WeatherApiResponse["daily"],
  thresholdMm = DEFAULT_DROUGHT_MAX_PRECIPITATION_MM
): { matched: boolean; totalPrecipitationMm: number } {
  const totalPrecipitationMm = daily.reduce((sum, day) => sum + day.precipitation, 0);
  return { matched: totalPrecipitationMm < thresholdMm, totalPrecipitationMm };
}

export interface TriggerThresholds {
  extremeWindKmh?: number;
  frostC?: number;
  droughtMaxPrecipitationMm?: number;
}

export function evaluateTriggers(
  response: WeatherApiResponse,
  configuredTriggers: TriggerType[],
  thresholds: TriggerThresholds = {}
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { current, daily } = response;

  for (const trigger of configuredTriggers) {
    switch (trigger) {
      case "RAIN":
        if (isRainy(current)) {
          matches.push({
            triggerType: "RAIN",
            message: `Rain conditions detected (weathercode ${current.weathercode})`,
            snapshot: { ...current },
          });
        }
        break;
      case "EXTREME_WIND": {
        const threshold = thresholds.extremeWindKmh ?? DEFAULT_EXTREME_WIND_THRESHOLD_KMH;
        if (isExtremeWind(current, threshold)) {
          matches.push({
            triggerType: "EXTREME_WIND",
            message: `Wind speed ${current.windspeed} km/h exceeds ${threshold} km/h threshold`,
            snapshot: { ...current, thresholdKmh: threshold },
          });
        }
        break;
      }
      case "FROST": {
        const threshold = thresholds.frostC ?? DEFAULT_FROST_THRESHOLD_C;
        if (isFrost(current, threshold)) {
          matches.push({
            triggerType: "FROST",
            message: `Temperature ${current.temperature}°C at or below ${threshold}°C`,
            snapshot: { ...current, thresholdC: threshold },
          });
        }
        break;
      }
      case "DROUGHT": {
        const threshold = thresholds.droughtMaxPrecipitationMm ?? DEFAULT_DROUGHT_MAX_PRECIPITATION_MM;
        const result = isDrySpellForecast(daily, threshold);
        if (result.matched) {
          matches.push({
            triggerType: "DROUGHT",
            message: `Only ${result.totalPrecipitationMm.toFixed(1)}mm of rain forecast over the next ${daily.length} days (threshold ${threshold}mm). Forecast-based dry-spell signal, not a historical drought index.`,
            snapshot: { totalPrecipitationMm: result.totalPrecipitationMm, days: daily.length, thresholdMm: threshold },
          });
        }
        break;
      }
    }
  }

  return matches;
}