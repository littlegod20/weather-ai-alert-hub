import { describe, it, expect } from "vitest";
import {
  evaluateTriggers,
  isRainy,
  isExtremeWind,
  isFrost,
  isDrySpellForecast,
} from "../triggers/evaluator";
import type { WeatherApiResponse } from "../lib/weatherTypes";

// Built directly from the live sample response for lat=-1.2921, lon=36.8219.
const sampleCurrent: WeatherApiResponse["current"] = {
  time: "2026-08-20T16:00",
  interval: 900,
  temperature: 24,
  windspeed: 13.3,
  winddirection: 62,
  is_day: 1,
  weathercode: 3, // overcast, not rain
};

const sampleDaily: WeatherApiResponse["daily"] = [
  { date: "2026-08-20", temp_max: 25.1, temp_min: 13.1, precipitation: 0.2, weathercode: 51 },
  { date: "2026-08-21", temp_max: 25.7, temp_min: 11.6, precipitation: 0, weathercode: 2 },
  { date: "2026-08-22", temp_max: 27.9, temp_min: 12.5, precipitation: 0, weathercode: 3 },
  { date: "2026-08-23", temp_max: 25.6, temp_min: 15.7, precipitation: 3.6, weathercode: 53 },
  { date: "2026-08-24", temp_max: 25.2, temp_min: 15.8, precipitation: 1.9, weathercode: 51 },
  { date: "2026-08-25", temp_max: 26.5, temp_min: 13.1, precipitation: 0, weathercode: 3 },
  { date: "2026-08-26", temp_max: 26, temp_min: 11.9, precipitation: 0, weathercode: 2 },
];

const sampleResponse: WeatherApiResponse = {
  lat: -1.2921,
  lon: 36.8219,
  units: "metric",
  days: 7,
  current: sampleCurrent,
  daily: sampleDaily,
  hourly: [{ time: "2026-08-20T00:00", temp: 16.4, precipitation: 0, weathercode: 3 }],
};

describe("isRainy", () => {
  it("is false for overcast (weathercode 3), matching the real Nairobi sample", () => {
    expect(isRainy(sampleCurrent)).toBe(false);
  });

  it("is true for drizzle (weathercode 51)", () => {
    expect(isRainy({ ...sampleCurrent, weathercode: 51 })).toBe(true);
  });

  it("is true for thunderstorm (weathercode 95)", () => {
    expect(isRainy({ ...sampleCurrent, weathercode: 95 })).toBe(true);
  });

  it("is false for clear sky (weathercode 0)", () => {
    expect(isRainy({ ...sampleCurrent, weathercode: 0 })).toBe(false);
  });
});

describe("isExtremeWind", () => {
  it("is false for the sample's 13.3 km/h against the default 60 km/h threshold", () => {
    expect(isExtremeWind(sampleCurrent)).toBe(false);
  });

  it("is true once windspeed meets the threshold", () => {
    expect(isExtremeWind({ ...sampleCurrent, windspeed: 60 }, 60)).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(isExtremeWind({ ...sampleCurrent, windspeed: 13.3 }, 10)).toBe(true);
  });
});

describe("isFrost", () => {
  it("is false for the sample's 24°C", () => {
    expect(isFrost(sampleCurrent)).toBe(false);
  });

  it("is true at exactly 0°C", () => {
    expect(isFrost({ ...sampleCurrent, temperature: 0 })).toBe(true);
  });

  it("is true below 0°C", () => {
    expect(isFrost({ ...sampleCurrent, temperature: -2.5 })).toBe(true);
  });
});

describe("isDrySpellForecast", () => {
  it("sums the sample's daily precipitation to 5.7mm and does not match the 5mm default threshold", () => {
    const result = isDrySpellForecast(sampleDaily);
    expect(result.totalPrecipitationMm).toBeCloseTo(5.7, 5);
    expect(result.matched).toBe(false);
  });

  it("matches when total precipitation is below the threshold", () => {
    const dryDaily = sampleDaily.map((d) => ({ ...d, precipitation: 0 }));
    const result = isDrySpellForecast(dryDaily, 5);
    expect(result.matched).toBe(true);
    expect(result.totalPrecipitationMm).toBe(0);
  });
});

describe("evaluateTriggers", () => {
  it("returns no matches for the real sample with all four triggers configured (mild day, no alerts expected)", () => {
    const matches = evaluateTriggers(sampleResponse, ["RAIN", "EXTREME_WIND", "FROST", "DROUGHT"]);
    expect(matches).toEqual([]);
  });

  it("only evaluates the triggers a location has configured", () => {
    const rainyResponse: WeatherApiResponse = {
      ...sampleResponse,
      current: { ...sampleCurrent, weathercode: 63, temperature: -5, windspeed: 80 },
    };
    const matches = evaluateTriggers(rainyResponse, ["RAIN"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].triggerType).toBe("RAIN");
  });

  it("matches multiple triggers at once and includes a snapshot on each", () => {
    const extremeResponse: WeatherApiResponse = {
      ...sampleResponse,
      current: { ...sampleCurrent, weathercode: 65, temperature: -3, windspeed: 90 },
    };
    const matches = evaluateTriggers(extremeResponse, ["RAIN", "EXTREME_WIND", "FROST"]);
    const types = matches.map((m) => m.triggerType).sort();
    expect(types).toEqual(["EXTREME_WIND", "FROST", "RAIN"]);
    for (const match of matches) {
      expect(match.snapshot).toBeTruthy();
      expect(match.message.length).toBeGreaterThan(0);
    }
  });

  it("DROUGHT message is honest about being a forecast proxy, not a historical drought index", () => {
    const dryDaily = sampleDaily.map((d) => ({ ...d, precipitation: 0 }));
    const dryResponse: WeatherApiResponse = { ...sampleResponse, daily: dryDaily };
    const matches = evaluateTriggers(dryResponse, ["DROUGHT"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].message).toMatch(/forecast-based/i);
  });
});