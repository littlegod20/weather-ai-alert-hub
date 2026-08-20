import "dotenv/config";
import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { getEnv } from "./config/env";
import { logger } from "./lib/logger";
import { closeRedis } from "./lib/redis";
import { QuotaExceededError } from "./lib/weatherTypes";
import { apiRouter } from "./routes";
import { startPoller, stopPoller } from "./scheduler/poller";
import { prisma } from "./db/client";

export function createApp() {
  const env = getEnv();
  const app = express();

  app.use(cors({ origin: env.FRONTEND_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(apiRouter);

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    void req;
    void next;
    if (error instanceof ZodError) {
      res.status(400).json({ error: "validation failed", issues: error.issues });
      return;
    }
    if (error instanceof QuotaExceededError) {
      res.status(429).json({ error: error.message, quota: error.quota });
      return;
    }
    logger.error({ err: error }, "unhandled error");
    res.status(500).json({ error: "internal error" });
  });

  return app;
}

export async function startServer(): Promise<void> {
  const env = getEnv();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "backend listening");
  });

  startPoller();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close();
    await stopPoller();
    await prisma.$disconnect();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (require.main === module) {
  void startServer();
}
