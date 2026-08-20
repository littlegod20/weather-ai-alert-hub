import cron from "node-cron";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./db/client";
import { redis } from "./lib/redis";
import { QuotaTracker } from "./lib/quotaTracker";
import { WeatherCache } from "./lib/weatherCache";
import { WeatherAiClient } from "./lib/weatherClient";
import { PrismaLocationsRepo, PrismaAlertsRepo, PrismaPollLogsRepo } from "./db/locationsRepo";
import { startScheduler } from "./scheduler/poller";
import { createApp } from "./app";

const quotaTracker = new QuotaTracker(redis);
const weatherCache = new WeatherCache(redis);
const weatherClient = new WeatherAiClient(weatherCache, quotaTracker);
const locationsRepo = new PrismaLocationsRepo(prisma);
const alertsRepo = new PrismaAlertsRepo(prisma);
const pollLogsRepo = new PrismaPollLogsRepo(prisma);

const app = createApp({ locationsRepo, alertsRepo, quotaTracker });

const server = app.listen(env.PORT, () => {
  logger.info(`WeatherAI Alert Hub listening on port ${env.PORT}`);
});

const scheduler = startScheduler(
  { locationsRepo, alertsRepo, pollLogsRepo, weatherClient, quotaTracker },
  cron.schedule
);

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  scheduler.stop();
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));