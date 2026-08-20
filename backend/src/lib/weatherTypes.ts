import { z } from "zod";

/**
 * Confirmed against a live /v1/weather response on 2026-08-20 for lat=-1.2921,
 * lon=36.8219. Field names and weathercode values match the Open-Meteo schema
 * (WMO weather interpretation codes), which is what WeatherAI appears to proxy.
 * https://open-meteo.com/en/docs#weathervariables documents the full code table.
 */

const currentWeatherSchema = z.object({
  time: z.string(),
  interval: z.number(),
  temperature: z.number(),
  windspeed: z.number(),
  winddirection: z.number(),
  is_day: z.union([z.literal(0), z.literal(1)]),
  weathercode: z.number().int(),
});

const dailyForecastEntrySchema = z.object({
  date: z.string(),
  temp_max: z.number(),
  temp_min: z.number(),
  precipitation: z.number(),
  weathercode: z.number().int(),
});

const hourlyForecastEntrySchema = z.object({
  time: z.string(),
  temp: z.number(),
  precipitation: z.number(),
  weathercode: z.number().int(),
});

export const weatherApiResponseSchema = z
  .object({
    lat: z.number(),
    lon: z.number(),
    units: z.string(),
    days: z.number(),
    current: currentWeatherSchema,
    daily: z.array(dailyForecastEntrySchema),
    hourly: z.array(hourlyForecastEntrySchema),
    ai_summary: z.string().optional(),
  })
  .passthrough();

export type CurrentWeather = z.infer<typeof currentWeatherSchema>;
export type DailyForecastEntry = z.infer<typeof dailyForecastEntrySchema>;
export type HourlyForecastEntry = z.infer<typeof hourlyForecastEntrySchema>;
export type WeatherApiResponse = z.infer<typeof weatherApiResponseSchema>;

export interface GetWeatherParams {
  lat: number;
  lon: number;
  days?: number;
  units?: "metric" | "imperial";
}