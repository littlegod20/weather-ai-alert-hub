import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { TRIGGER_TYPES, UNITS } from "../lib/weatherTypes";

export const locationsRouter = Router();

const createLocationSchema = z.object({
  name: z.string().min(1).optional(),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  units: z.enum(UNITS).default("metric"),
  triggerTypes: z.array(z.enum(TRIGGER_TYPES)).min(1),
  active: z.boolean().default(true),
});

const updateLocationSchema = createLocationSchema.partial();

function locationId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string") {
    throw new Error("missing location id");
  }
  return id;
}

locationsRouter.post("/locations", async (req, res) => {
  const body = createLocationSchema.parse(req.body);
  const location = await prisma.location.create({ data: body });
  res.status(201).json(location);
});

locationsRouter.get("/locations", async (req, res) => {
  void req;
  const locations = await prisma.location.findMany({ orderBy: { createdAt: "desc" } });
  res.json(locations);
});

locationsRouter.get("/locations/:id", async (req, res) => {
  const id = locationId(req);
  const location = await prisma.location.findUnique({
    where: { id },
    include: { pollLogs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!location) {
    res.status(404).json({ error: "location not found" });
    return;
  }
  res.json(location);
});

locationsRouter.patch("/locations/:id", async (req, res) => {
  const id = locationId(req);
  const body = updateLocationSchema.parse(req.body);
  try {
    const location = await prisma.location.update({
      where: { id },
      data: body,
    });
    res.json(location);
  } catch {
    res.status(404).json({ error: "location not found" });
  }
});

locationsRouter.delete("/locations/:id", async (req, res) => {
  const id = locationId(req);
  try {
    await prisma.location.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "location not found" });
  }
});

locationsRouter.get("/locations/:id/alerts", async (req, res) => {
  const id = locationId(req);
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) {
    res.status(404).json({ error: "location not found" });
    return;
  }
  const alerts = await prisma.alertEvent.findMany({
    where: { locationId: id },
    orderBy: { createdAt: "desc" },
  });
  res.json(alerts);
});
