import { env } from "./config/env";
import { logger } from './lib/logger'
import { prisma } from "./db/client";
import { redis } from "./lib/redis";
import { QuotaTracker } from "./lib/quotaTracker";
import { PrismaLocationsRepo, PrismaAlertsRepo } from "./db/locationsRepo";
import { createApp } from "./app";

const quotaTracker = new QuotaTracker(redis);
const locationsRepo = new PrismaLocationsRepo(prisma);
const alertsRepo = new PrismaAlertsRepo(prisma);

const app = createApp({ locationsRepo, alertsRepo, quotaTracker });

const server = app.listen(env.PORT, () => {
  logger.info(`WeatherAI Alert Hub listening on port ${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));