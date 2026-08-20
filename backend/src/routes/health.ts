import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  void req;
  res.json({ ok: true });
});
