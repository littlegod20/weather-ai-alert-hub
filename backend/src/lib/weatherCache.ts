import { getEnv } from "../config/env";
import { getRedis } from "./redis";
import type { Units, WeatherPayload } from "./weatherTypes";

export function roundCoord(value: number): string {
  return value.toFixed(2);
}

export function weatherCacheKey(lat: number, lon: number, units: Units): string {
  return `weather:${roundCoord(lat)}:${roundCoord(lon)}:${units}`;
}

export async function getCachedWeather(
  lat: number,
  lon: number,
  units: Units,
): Promise<WeatherPayload | null> {
  const raw = await getRedis().get(weatherCacheKey(lat, lon, units));
  if (raw == null) return null;
  return JSON.parse(raw) as WeatherPayload;
}

export async function setCachedWeather(
  lat: number,
  lon: number,
  units: Units,
  payload: WeatherPayload,
  ttlSeconds = getEnv().WEATHER_CACHE_TTL_SECONDS,
): Promise<void> {
  await getRedis().set(
    weatherCacheKey(lat, lon, units),
    JSON.stringify(payload),
    "EX",
    ttlSeconds,
  );
}
