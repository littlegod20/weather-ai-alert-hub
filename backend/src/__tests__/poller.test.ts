import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { WeatherCache } from "../lib/weatherCache";
import { QuotaTracker } from "../lib/quotaTracker";
import { WeatherAiClient } from "../lib/weatherClient";
import { isDue, pollLocation, runPollCycle, buildCronExpression, startScheduler } from "../scheduler/poller";
import type {
  LocationsRepo,
  AlertsRepo,
  PollLogsRepo,
  LocationRecord,
  AlertEventRecord,
  AlertEventCreateInput,
  PollLogRecord,
  PollLogCreateInput,
} from "../db/locationsRepo";
import type { WeatherApiResponse } from "../lib/weatherTypes";

const baseLocation: LocationRecord = {
  id: "loc_1",
  label: "Nairobi",
  lat: -1.2921,
  lon: 36.8219,
  timezone: "UTC",
  units: "metric",
  triggers: ["RAIN", "FROST"],
  active: true,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

function makeWeatherResponse(overrides: Partial<WeatherApiResponse["current"]> = {}): WeatherApiResponse {
  return {
    lat: -1.2921,
    lon: 36.8219,
    units: "metric",
    days: 7,
    current: {
      time: "2026-08-20T16:00",
      interval: 900,
      temperature: 24,
      windspeed: 13.3,
      winddirection: 62,
      is_day: 1,
      weathercode: 3,
      ...overrides,
    },
    daily: [{ date: "2026-08-20", temp_max: 25.1, temp_min: 13.1, precipitation: 0.2, weathercode: 51 }],
    hourly: [{ time: "2026-08-20T00:00", temp: 16.4, precipitation: 0, weathercode: 3 }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

class FakeLocationsRepo implements LocationsRepo {
  constructor(private locations: LocationRecord[]) {}
  async create(): Promise<LocationRecord> {
    throw new Error("not used in poller tests");
  }
  async findMany(): Promise<LocationRecord[]> {
    return this.locations;
  }
  async findById(id: string): Promise<LocationRecord | null> {
    return this.locations.find((l) => l.id === id) ?? null;
  }
  async update(): Promise<LocationRecord | null> {
    throw new Error("not used in poller tests");
  }
  async remove(): Promise<boolean> {
    throw new Error("not used in poller tests");
  }
}

class FakeAlertsRepo implements AlertsRepo {
  public created: AlertEventRecord[] = [];
  private idCounter = 0;
  async findByLocation(): Promise<AlertEventRecord[]> {
    return this.created;
  }
  async create(input: AlertEventCreateInput): Promise<AlertEventRecord> {
    const record: AlertEventRecord = { id: `alert_${++this.idCounter}`, triggeredAt: new Date(), ...input };
    this.created.push(record);
    return record;
  }
}

class FakePollLogsRepo implements PollLogsRepo {
  public created: PollLogRecord[] = [];
  private idCounter = 0;
  private latest = new Map<string, Date>();

  seedLatest(locationId: string, date: Date) {
    this.latest.set(locationId, date);
  }

  async findLatestPolledAt(locationId: string): Promise<Date | null> {
    return this.latest.get(locationId) ?? null;
  }

  async create(input: PollLogCreateInput): Promise<PollLogRecord> {
    const record: PollLogRecord = { id: `poll_${++this.idCounter}`, polledAt: new Date(), ...input };
    this.created.push(record);
    this.latest.set(input.locationId, record.polledAt);
    return record;
  }
}

function makeWeatherClient(fetchImpl: any, redis: any) {
  const cache = new WeatherCache(redis, 1500);
  const quota = new QuotaTracker(redis, 20);
  const client = new WeatherAiClient(cache, quota, {
    apiKey: "wai_test_key",
    baseUrl: "https://api.weather-ai.co",
    fetchImpl,
    sleep: vi.fn().mockResolvedValue(undefined),
  });
  return { client, quota };
}

describe("isDue", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("is due when never polled before", () => {
    expect(isDue(null, now, 1800)).toBe(true);
  });

  it("is not due when polled recently, inside the interval", () => {
    const lastPolledAt = new Date("2026-08-20T11:50:00Z");
    expect(isDue(lastPolledAt, now, 1800)).toBe(false);
  });

  it("is due once the interval has fully elapsed", () => {
    const lastPolledAt = new Date("2026-08-20T11:30:00Z");
    expect(isDue(lastPolledAt, now, 1800)).toBe(true);
  });
});

describe("buildCronExpression", () => {
  it("builds a seconds-field expression for sub-minute ticks", () => {
    expect(buildCronExpression(30)).toBe("*/30 * * * * *");
  });

  it("builds a minute-field expression for whole-minute ticks", () => {
    expect(buildCronExpression(60)).toBe("0 */1 * * * *");
    expect(buildCronExpression(300)).toBe("0 */5 * * * *");
  });

  it("throws on a non-divisible interval over a minute", () => {
    expect(() => buildCronExpression(90)).toThrow();
  });

  it("throws on zero or negative input", () => {
    expect(() => buildCronExpression(0)).toThrow();
    expect(() => buildCronExpression(-5)).toThrow();
  });
});

describe("pollLocation", () => {
  let redis: any;
  beforeEach(async () => {
    if (!redis) redis = new RedisMock();
    await redis.flushall();
  });

  it("writes no alerts and one poll log on a quiet result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeWeatherResponse()));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const alertsRepo = new FakeAlertsRepo();
    const pollLogsRepo = new FakePollLogsRepo();

    const outcome = await pollLocation(baseLocation, {
      locationsRepo: new FakeLocationsRepo([baseLocation]),
      alertsRepo,
      pollLogsRepo,
      weatherClient: client,
      quotaTracker: quota,
    });

    expect(outcome.status).toBe("ok");
    expect(outcome.matchesCount).toBe(0);
    expect(alertsRepo.created).toHaveLength(0);
    expect(pollLogsRepo.created).toHaveLength(1);
    expect(pollLogsRepo.created[0].statusCode).toBe(200);
  });

  it("writes an alert when a trigger matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeWeatherResponse({ weathercode: 63 })));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const alertsRepo = new FakeAlertsRepo();
    const pollLogsRepo = new FakePollLogsRepo();

    const outcome = await pollLocation(baseLocation, {
      locationsRepo: new FakeLocationsRepo([baseLocation]),
      alertsRepo,
      pollLogsRepo,
      weatherClient: client,
      quotaTracker: quota,
    });

    expect(outcome.status).toBe("ok");
    expect(outcome.matchesCount).toBe(1);
    expect(alertsRepo.created).toHaveLength(1);
    expect(alertsRepo.created[0].triggerType).toBe("RAIN");
  });

  it("returns quota_exceeded and writes no poll log when quota is gone", async () => {
    const fetchImpl = vi.fn();
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const future = Math.floor(Date.now() / 1000) + 3600;
    await quota.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "5", "X-RateLimit-Reset": String(future) })
    );
    const pollLogsRepo = new FakePollLogsRepo();

    const outcome = await pollLocation(baseLocation, {
      locationsRepo: new FakeLocationsRepo([baseLocation]),
      alertsRepo: new FakeAlertsRepo(),
      pollLogsRepo,
      weatherClient: client,
      quotaTracker: quota,
    });

    expect(outcome.status).toBe("quota_exceeded");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(pollLogsRepo.created).toHaveLength(0);
  });

  it("logs a failed poll (non-zero status) and returns status=error on a persistent API failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const pollLogsRepo = new FakePollLogsRepo();

    const outcome = await pollLocation(baseLocation, {
      locationsRepo: new FakeLocationsRepo([baseLocation]),
      alertsRepo: new FakeAlertsRepo(),
      pollLogsRepo,
      weatherClient: client,
      quotaTracker: quota,
    });

    expect(outcome.status).toBe("error");
    expect(pollLogsRepo.created).toHaveLength(1);
    expect(pollLogsRepo.created[0].statusCode).toBe(500);
  }, 10000);
});

describe("runPollCycle", () => {
  let redis: any;
  beforeEach(async () => {
    if (!redis) redis = new RedisMock();
    await redis.flushall();
  });

  const now = new Date("2026-08-20T12:00:00Z");

  it("skips inactive locations and locations with no triggers configured", async () => {
    const inactive: LocationRecord = { ...baseLocation, id: "loc_inactive", active: false };
    const noTriggers: LocationRecord = { ...baseLocation, id: "loc_no_triggers", triggers: [] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeWeatherResponse()));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);

    const result = await runPollCycle({
      locationsRepo: new FakeLocationsRepo([baseLocation, inactive, noTriggers]),
      alertsRepo: new FakeAlertsRepo(),
      pollLogsRepo: new FakePollLogsRepo(),
      weatherClient: client,
      quotaTracker: quota,
      now: () => now,
    });

    expect(result.checked).toBe(3);
    expect(result.due).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips a location that was polled too recently", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeWeatherResponse()));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const pollLogsRepo = new FakePollLogsRepo();
    pollLogsRepo.seedLatest("loc_1", new Date("2026-08-20T11:50:00Z"));

    const result = await runPollCycle({
      locationsRepo: new FakeLocationsRepo([baseLocation]),
      alertsRepo: new FakeAlertsRepo(),
      pollLogsRepo,
      weatherClient: client,
      quotaTracker: quota,
      minPollIntervalSeconds: 1800,
      now: () => now,
    });

    expect(result.due).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops the cycle early once quota is exhausted, leaving later locations unpolled", async () => {
    const locB: LocationRecord = { ...baseLocation, id: "loc_2", lat: 51.5, lon: -0.12 };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeWeatherResponse()));
    const { client, quota } = makeWeatherClient(fetchImpl, redis);
    const future = Math.floor(Date.now() / 1000) + 3600;
    await quota.recordFromHeaders(
      new Headers({ "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "5", "X-RateLimit-Reset": String(future) })
    );

    const result = await runPollCycle({
      locationsRepo: new FakeLocationsRepo([baseLocation, locB]),
      alertsRepo: new FakeAlertsRepo(),
      pollLogsRepo: new FakePollLogsRepo(),
      weatherClient: client,
      quotaTracker: quota,
      now: () => now,
    });

    expect(result.due).toBe(2);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].status).toBe("quota_exceeded");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("buildCronExpression against the real node-cron parser", () => {
  // Regression test for the exact bug found in production: the string-shape
  // tests above never fed the expression to a real cron parser, so a wrong
  // seconds field ("*" instead of "0") passed those tests while firing every
  // second in practice. This test actually schedules it and counts ticks.
  it("does not fire within ~2s for a 60s tick", async () => {
    const cron = await import("node-cron");
    const expression = buildCronExpression(60);
    let calls = 0;
    const task = cron.schedule(expression, () => {
      calls++;
    });
    await new Promise((resolve) => setTimeout(resolve, 2200));
    task.stop();
    expect(calls).toBe(0);
  }, 5000);
});

describe("startScheduler", () => {
  it("builds the expected cron expression and registers exactly one task", () => {
    const scheduleFn = vi.fn().mockReturnValue({ stop: vi.fn() });
    const redis = new RedisMock();
    const { client, quota } = makeWeatherClient(vi.fn(), redis);

    startScheduler(
      {
        locationsRepo: new FakeLocationsRepo([]),
        alertsRepo: new FakeAlertsRepo(),
        pollLogsRepo: new FakePollLogsRepo(),
        weatherClient: client,
        quotaTracker: quota,
      },
      scheduleFn,
      30
    );

    expect(scheduleFn).toHaveBeenCalledTimes(1);
    expect(scheduleFn.mock.calls[0][0]).toBe("*/30 * * * * *");
    expect(typeof scheduleFn.mock.calls[0][1]).toBe("function");
  });
});