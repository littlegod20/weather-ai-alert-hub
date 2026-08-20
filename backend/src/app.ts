import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { createLocationsRouter } from "./routes/locations";
import { createQuotaRouter } from "./routes/quota";
import { createHealthRouter } from "./routes/health";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import type { LocationsRepo, AlertsRepo } from "./db/locationsRepo";
import type { QuotaTracker } from "./lib/quotaTracker";

export interface AppDependencies {
  locationsRepo: LocationsRepo;
  alertsRepo: AlertsRepo;
  quotaTracker: QuotaTracker;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger, autoLogging: process.env.NODE_ENV !== "test" }));

  app.use("/health", createHealthRouter());
  app.use("/quota", createQuotaRouter(deps.quotaTracker));
  app.use("/locations", createLocationsRouter(deps.locationsRepo, deps.alertsRepo));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}