import { schedule, type ScheduledTask } from "node-cron";
import { Prisma } from "../generated/prisma/client";
import { getEnv } from "../config/env";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { getWeather } from "../lib/weatherClient";
import { QuotaExceededError, WeatherApiError, type TriggerType } from "../lib/weatherTypes";
import { evaluateTriggers } from "../triggers/evaluator";

let task: ScheduledTask | undefined;
let ticking = false;

function cronExpression(tickSeconds: number): string {
  if (tickSeconds % 60 === 0) {
    return `*/${tickSeconds / 60} * * * *`;
  }
  return `*/${tickSeconds} * * * * *`;
}

export async function pollDueLocations(): Promise<void> {
  const env = getEnv();
  const cutoff = new Date(Date.now() - env.MIN_POLL_INTERVAL_SECONDS * 1000);
  const due = await prisma.location.findMany({
    where: {
      active: true,
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lte: cutoff } }],
    },
  });

  for (const location of due) {
    await pollOne(location);
  }
}

async function pollOne(location: {
  id: string;
  lat: number;
  lon: number;
  units: "metric" | "imperial";
  triggerTypes: TriggerType[];
}): Promise<void> {
  try {
    const result = await getWeather({
      lat: location.lat,
      lon: location.lon,
      units: location.units,
    });
    const matches = evaluateTriggers(result.payload, location.triggerTypes);

    if (matches.length > 0) {
      await prisma.alertEvent.createMany({
        data: matches.map((match) => ({
          locationId: location.id,
          triggerType: match.triggerType,
          reason: match.reason,
          payload: match.evidence as Prisma.InputJsonValue,
        })),
      });
    }

    await prisma.$transaction([
      prisma.pollLog.create({
        data: {
          locationId: location.id,
          outcome: result.source === "cache" ? "cached" : "fetched",
          cacheHit: result.source === "cache",
          quotaRemaining: result.quota?.remaining ?? null,
        },
      }),
      prisma.location.update({
        where: { id: location.id },
        data: { lastPolledAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      await prisma.pollLog.create({
        data: {
          locationId: location.id,
          outcome: "skipped_quota",
          quotaRemaining: error.quota.remaining,
          errorMessage: error.message,
        },
      });
      logger.warn({ locationId: location.id, remaining: error.quota.remaining }, "poll skipped: quota");
      return;
    }

    const message =
      error instanceof WeatherApiError
        ? `${error.message}: ${JSON.stringify(error.body)}`
        : error instanceof Error
          ? error.message
          : String(error);

    await prisma.pollLog.create({
      data: {
        locationId: location.id,
        outcome: "error",
        errorMessage: message,
      },
    });
    logger.error({ locationId: location.id, err: error }, "poll failed");
  }
}

export function startPoller(): ScheduledTask {
  if (task) return task;

  const env = getEnv();
  const expression = cronExpression(env.SCHEDULER_TICK_SECONDS);
  task = schedule(
    expression,
    async () => {
      if (ticking) return;
      ticking = true;
      try {
        await pollDueLocations();
      } catch (error) {
        logger.error({ err: error }, "poller tick failed");
      } finally {
        ticking = false;
      }
    },
    { noOverlap: true, name: "weather-poller" },
  );

  logger.info({ expression }, "poller started");
  return task;
}

export async function stopPoller(): Promise<void> {
  if (!task) return;
  await task.destroy();
  task = undefined;
}
