import { Router } from "express";
import { getQuota } from "../lib/quotaTracker";

export const quotaRouter = Router();

quotaRouter.get("/quota", async (req, res) => {
  void req;
  const quota = await getQuota();
  if (!quota) {
    res.json({ known: false, limit: null, remaining: null, resetAt: null });
    return;
  }
  res.json({ known: true, ...quota });
});
