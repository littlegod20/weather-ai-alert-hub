import { Router, type Request, type Response, type NextFunction } from "express";
import type { LocationsRepo, AlertsRepo } from "../db/locationsRepo";
import { locationCreateSchema, locationUpdateSchema, paginationQuerySchema } from "../lib/validation";

function locationId(req: Request): string {
  const id = req.params.id;
  const value = Array.isArray(id) ? id[0] : id;
  if (typeof value !== "string") {
    throw new Error("missing location id");
  }
  return value;
}

export function createLocationsRouter(locationsRepo: LocationsRepo, alertsRepo: AlertsRepo): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = locationCreateSchema.parse(req.body);
      const location = await locationsRepo.create(input);
      res.status(201).json(location);
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const locations = await locationsRepo.findMany();
      res.json(locations);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const location = await locationsRepo.findById(locationId(req));
      if (!location) {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      res.json(location);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = locationUpdateSchema.parse(req.body);
      const location = await locationsRepo.update(locationId(req), input);
      if (!location) {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      res.json(location);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const removed = await locationsRepo.remove(locationId(req));
      if (!removed) {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/alerts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = locationId(req);
      const location = await locationsRepo.findById(id);
      if (!location) {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      const { limit, offset } = paginationQuerySchema.parse(req.query);
      const alerts = await alertsRepo.findByLocation(id, limit, offset);
      res.json(alerts);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
