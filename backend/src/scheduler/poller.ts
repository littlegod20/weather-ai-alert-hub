import { env } from "../config/env";
import { logger } from "../lib/logger";
import { WeatherAiClient } from "../lib/weatherClient";
import { QuotaExceededError, WeatherApiError } from "../lib/weatherErrors";
import { evaluateTriggers, type TriggerType } from "../triggers/evaluator";
import type { LocationsRepo, AlertsRepo, PollLogsRepo, LocationRecord } from "../db/locationsRepo";
import type { QuotaTracker } from "../lib/quotaTracker";

export interface PollerDependencies {
  locationsRepo: LocationsRepo;
  alertsRepo: AlertsRepo;
  pollLogsRepo: PollLogsRepo;
  weatherClient: WeatherAiClient;
  quotaTracker: QuotaTracker;
  minPollIntervalSeconds?: number;
  now?: () => Date;
}

export interface PollOutcome {
  locationId: string;
  status: "ok" | "error" | "quota_exceeded";
  matchesCount?: number;
  cacheHit?: boolean;
  error?: string;
}

export interface PollCycleResult {
  checked: number;
  due: number;
  outcomes: PollOutcome[];
}

export function isDue(lastPolledAt: Date | null, now: Date, minIntervalSeconds: number): boolean {
  if (!lastPolledAt) return true;
  const elapsedSeconds = (now.getTime() - lastPolledAt.getTime()) / 1000;
  return elapsedSeconds >= minIntervalSeconds;
}

export async function pollLocation(location: LocationRecord, deps: PollerDependencies): Promise<PollOutcome> {
  try {
    const result = await deps.weatherClient.getWeather({
      lat: location.lat,
      lon: location.lon,
      units: location.units as "metric" | "imperial",
    });

    const matches = evaluateTriggers(result.data, location.triggers as TriggerType[]);
    for (const match of matches) {
      await deps.alertsRepo.create({
        locationId: location.id,
        triggerType: match.triggerType,
        message: match.message,
        snapshot: match.snapshot,
      });
    }

    const quotaState = await deps.quotaTracker.getState();
    await deps.pollLogsRepo.create({
      locationId: location.id,
      cacheHit: result.cacheHit,
      statusCode: 200,
      quotaRemaining: quotaState?.remaining ?? null,
    });

    if (matches.length > 0) {
      logger.info(
        { locationId: location.id, triggers: matches.map((m) => m.triggerType) },
        "Trigger(s) matched"
      );
    }

    return { locationId: location.id, status: "ok", matchesCount: matches.length, cacheHit: result.cacheHit };
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return { locationId: location.id, status: "quota_exceeded" };
    }

    const statusCode = err instanceof WeatherApiError ? err.status : 0;
    const message = err instanceof Error ? err.message : String(err);

    try {
      await deps.pollLogsRepo.create({
        locationId: location.id,
        cacheHit: false,
        statusCode,
        quotaRemaining: null,
      });
    } catch (logErr) {
      logger.error({ logErr, locationId: location.id }, "Failed to write poll log after a poll error");
    }

    logger.error({ err, locationId: location.id }, "Poll failed for location");
    return { locationId: location.id, status: "error", error: message };
  }
}

export async function runPollCycle(deps: PollerDependencies): Promise<PollCycleResult> {
  const now = (deps.now ?? (() => new Date()))();
  const minInterval = deps.minPollIntervalSeconds ?? env.MIN_POLL_INTERVAL_SECONDS;

  const allLocations = await deps.locationsRepo.findMany();
  const pollable = allLocations.filter((loc) => loc.active && loc.triggers.length > 0);

  const dueLocations: LocationRecord[] = [];
  for (const location of pollable) {
    const lastPolledAt = await deps.pollLogsRepo.findLatestPolledAt(location.id);
    if (isDue(lastPolledAt, now, minInterval)) {
      dueLocations.push(location);
    }
  }

  const outcomes: PollOutcome[] = [];
  for (const location of dueLocations) {
    const outcome = await pollLocation(location, deps);
    outcomes.push(outcome);

    if (outcome.status === "quota_exceeded") {
      logger.warn(
        { remaining: dueLocations.length - outcomes.length },
        "WeatherAI quota exhausted mid-cycle, stopping further polls this tick"
      );
      break;
    }
  }

  return { checked: allLocations.length, due: dueLocations.length, outcomes };
}

/**
 * Builds a node-cron expression for a tick interval given in seconds.
 * Supports sub-minute intervals (1-59s, via the seconds field) and
 * minute-aligned intervals (multiples of 60s, converted to the minute field,
 * since node-cron's 6th/leading seconds field only goes up to 59).
 */
export function buildCronExpression(tickSeconds: number): string {
  if (!Number.isInteger(tickSeconds) || tickSeconds <= 0) {
    throw new Error(`tickSeconds must be a positive integer, got ${tickSeconds}`);
  }
  if (tickSeconds < 60) {
    return `*/${tickSeconds} * * * * *`;
  }
  if (tickSeconds % 60 === 0) {
    return `* */${tickSeconds / 60} * * * *`;
  }
  throw new Error(
    `tickSeconds of ${tickSeconds} is neither under 60 nor a whole number of minutes, pick a value that divides evenly`
  );
}

export function startScheduler(
  deps: PollerDependencies,
  cronSchedule: (expression: string, task: () => void) => { stop: () => void },
  tickSeconds: number = env.SCHEDULER_TICK_SECONDS
): { stop: () => void } {
  const expression = buildCronExpression(tickSeconds);
  logger.info({ expression, tickSeconds }, "Starting poll scheduler");

  let running = false;
  const task = cronSchedule(expression, () => {
    if (running) {
      logger.warn("Previous poll cycle still running, skipping this tick");
      return;
    }
    running = true;
    runPollCycle(deps)
      .then((result) => {
        logger.info(result, "Poll cycle complete");
      })
      .catch((err) => {
        logger.error({ err }, "Poll cycle threw unexpectedly");
      })
      .finally(() => {
        running = false;
      });
  });

  return task;
}