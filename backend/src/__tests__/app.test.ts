import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import RedisMock from "ioredis-mock";
import { createApp } from "../app";
import { QuotaTracker } from "../lib/quotaTracker";
import type { LocationsRepo, AlertsRepo, LocationRecord, AlertEventRecord } from "../db/locationsRepo";
import type { LocationCreateInput, LocationUpdateInput } from "../lib/validation";

class InMemoryLocationsRepo implements LocationsRepo {
  private store = new Map<string, LocationRecord>();
  private idCounter = 0;

  async create(input: LocationCreateInput): Promise<LocationRecord> {
    const id = `loc_${++this.idCounter}`;
    const now = new Date();
    const record: LocationRecord = {
      id,
      label: input.label,
      lat: input.lat,
      lon: input.lon,
      timezone: input.timezone,
      units: input.units,
      triggers: input.triggers,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, record);
    return record;
  }

  async findMany(): Promise<LocationRecord[]> {
    return [...this.store.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<LocationRecord | null> {
    return this.store.get(id) ?? null;
  }

  async update(id: string, input: LocationUpdateInput): Promise<LocationRecord | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: LocationRecord = { ...existing, ...input, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

class InMemoryAlertsRepo implements AlertsRepo {
    private idCounter = 0;
  
    constructor(public alerts: AlertEventRecord[] = []) {}
  
    async findByLocation(locationId: string, limit: number, offset: number): Promise<AlertEventRecord[]> {
      return this.alerts
        .filter((a) => a.locationId === locationId)
        .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime())
        .slice(offset, offset + limit);
    }
  
    async create(input: { locationId: string; triggerType: string; message: string; snapshot: unknown }): Promise<AlertEventRecord> {
      const record: AlertEventRecord = { id: `alert_${++this.idCounter}`, triggeredAt: new Date(), ...input };
      this.alerts.push(record);
      return record;
    }
  }

function buildApp(redis: any) {
  const locationsRepo = new InMemoryLocationsRepo();
  const alertsRepo = new InMemoryAlertsRepo([
    {
      id: "alert_1",
      locationId: "will-be-set",
      triggerType: "RAIN",
      message: "Rain conditions detected",
      snapshot: { weathercode: 61 },
      triggeredAt: new Date("2026-08-20T10:00:00Z"),
    },
  ]);
  const quotaTracker = new QuotaTracker(redis, 20);
  const app = createApp({ locationsRepo, alertsRepo, quotaTracker });
  return { app, locationsRepo, alertsRepo, quotaTracker };
}

const validBody = {
  label: "Nairobi",
  lat: -1.2921,
  lon: 36.8219,
  triggers: ["RAIN", "FROST"],
};

let redis: any;

beforeEach(async () => {
  if (!redis) redis = new RedisMock();
  await redis.flushall();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("POST /locations", () => {
  it("creates a location and returns 201", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).post("/locations").send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("Nairobi");
    expect(res.body.triggers).toEqual(["RAIN", "FROST"]);
    expect(res.body.units).toBe("metric");
    expect(res.body.active).toBe(true);
  });

  it("rejects an invalid body with 400 and validation issues", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).post("/locations").send({ label: "", lat: 999, triggers: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it("rejects an unrecognized trigger type", async () => {
    const { app } = buildApp(redis);
    const res = await request(app)
      .post("/locations")
      .send({ ...validBody, triggers: ["HURRICANE"] });
    expect(res.status).toBe(400);
  });
});

describe("GET /locations", () => {
  it("returns an empty array when nothing is registered", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/locations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns created locations", async () => {
    const { app } = buildApp(redis);
    await request(app).post("/locations").send(validBody);
    const res = await request(app).get("/locations");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /locations/:id", () => {
  it("returns 404 for an unknown id", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/locations/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns the location when it exists", async () => {
    const { app } = buildApp(redis);
    const created = await request(app).post("/locations").send(validBody);
    const res = await request(app).get(`/locations/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe("PATCH /locations/:id", () => {
  it("updates provided fields and leaves others untouched", async () => {
    const { app } = buildApp(redis);
    const created = await request(app).post("/locations").send(validBody);
    const res = await request(app).patch(`/locations/${created.body.id}`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.label).toBe("Nairobi");
  });

  it("returns 404 for an unknown id", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).patch("/locations/does-not-exist").send({ active: false });
    expect(res.status).toBe(404);
  });

  it("rejects an empty update body", async () => {
    const { app } = buildApp(redis);
    const created = await request(app).post("/locations").send(validBody);
    const res = await request(app).patch(`/locations/${created.body.id}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /locations/:id", () => {
  it("deletes an existing location and returns 204", async () => {
    const { app } = buildApp(redis);
    const created = await request(app).post("/locations").send(validBody);
    const res = await request(app).delete(`/locations/${created.body.id}`);
    expect(res.status).toBe(204);

    const followUp = await request(app).get(`/locations/${created.body.id}`);
    expect(followUp.status).toBe(404);
  });

  it("returns 404 deleting an id that doesn't exist", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).delete("/locations/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("GET /locations/:id/alerts", () => {
  it("returns 404 if the location doesn't exist", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/locations/does-not-exist/alerts");
    expect(res.status).toBe(404);
  });

  it("returns alert history for an existing location", async () => {
    const { app, alertsRepo } = buildApp(redis);
    const created = await request(app).post("/locations").send(validBody);
    (alertsRepo as InMemoryAlertsRepo).alerts[0].locationId = created.body.id;

    const res = await request(app).get(`/locations/${created.body.id}/alerts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].triggerType).toBe("RAIN");
  });
});

describe("GET /quota", () => {
  it("reports unknown quota state before any WeatherAI request has happened", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/quota");
    expect(res.status).toBe(200);
    expect(res.body.known).toBe(false);
  });

  it("reports the recorded quota state", async () => {
    const { app, quotaTracker } = buildApp(redis);
    const future = Math.floor(Date.now() / 1000) + 3600;
    await quotaTracker.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "77", "X-RateLimit-Reset": String(future) })
    );
    const res = await request(app).get("/quota");
    expect(res.status).toBe(200);
    expect(res.body.known).toBe(true);
    expect(res.body.remaining).toBe(77);
  });
});

describe("unmatched routes", () => {
  it("returns 404 for an unknown path", async () => {
    const { app } = buildApp(redis);
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});