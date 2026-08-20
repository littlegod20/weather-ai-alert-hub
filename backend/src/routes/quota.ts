import { Router, type Request, type Response, type NextFunction } from "express";
import type { QuotaTracker } from "../lib/quotaTracker";

export function createQuotaRouter(quotaTracker: QuotaTracker): Router {
  const router = Router();

  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const state = await quotaTracker.getState();
      if (!state) {
        res.json({ known: false, message: "No quota data yet, no WeatherAI request has been made this process." });
        return;
      }
      res.json({
        known: true,
        limit: state.limit,
        remaining: state.remaining,
        resetAt: new Date(state.resetAt * 1000).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}