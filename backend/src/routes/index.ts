import { Router } from "express";
import { healthRouter } from "./health";
import { locationsRouter } from "./locations";
import { quotaRouter } from "./quota";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(quotaRouter);
apiRouter.use(locationsRouter);
