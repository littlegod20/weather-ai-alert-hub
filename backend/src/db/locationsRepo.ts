import type { PrismaClient } from "../generated/prisma/client";
import type { LocationCreateInput, LocationUpdateInput } from "../lib/validation";

export interface LocationRecord {
  id: string;
  label: string;
  lat: number;
  lon: number;
  timezone: string;
  units: string;
  triggers: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastPollSnapshot?: unknown | null;
  lastPolledAt?: Date | null;
}

export interface AlertEventRecord {
  id: string;
  locationId: string;
  triggerType: string;
  message: string;
  snapshot: unknown;
  triggeredAt: Date;
}

export interface AlertEventCreateInput {
  locationId: string;
  triggerType: string;
  message: string;
  snapshot: unknown;
}

export interface PollLogRecord {
  id: string;
  locationId: string;
  polledAt: Date;
  cacheHit: boolean;
  statusCode: number;
  quotaRemaining: number | null;
  snapshot?: unknown | null;
}

export interface PollLogCreateInput {
  locationId: string;
  cacheHit: boolean;
  statusCode: number;
  quotaRemaining: number | null;
  snapshot?: unknown | null;
}

export interface LocationsRepo {
  create(input: LocationCreateInput): Promise<LocationRecord>;
  findMany(): Promise<LocationRecord[]>;
  findById(id: string): Promise<LocationRecord | null>;
  update(id: string, input: LocationUpdateInput): Promise<LocationRecord | null>;
  remove(id: string): Promise<boolean>;
}

export interface AlertsRepo {
  findByLocation(locationId: string, limit: number, offset: number): Promise<AlertEventRecord[]>;
  create(input: AlertEventCreateInput): Promise<AlertEventRecord>;
}

export interface PollLogsRepo {
  findLatestPolledAt(locationId: string): Promise<Date | null>;
  create(input: PollLogCreateInput): Promise<PollLogRecord>;
}

export class PrismaLocationsRepo implements LocationsRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: LocationCreateInput): Promise<LocationRecord> {
    return this.prisma.location.create({ data: input }) as unknown as Promise<LocationRecord>;
  }

  async findMany(): Promise<LocationRecord[]> {
    return this.prisma.location.findMany({ orderBy: { createdAt: "desc" } }) as unknown as Promise<LocationRecord[]>;
  }

  async findById(id: string): Promise<LocationRecord | null> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        pollLogs: {
          orderBy: { polledAt: "desc" },
          take: 1,
          select: { snapshot: true, polledAt: true },
        },
      },
    });
    if (!location) return null;
    const latestLog = (location.pollLogs as Array<{ snapshot: unknown; polledAt: Date }>)[0];
    const { pollLogs: _, ...rest } = location as typeof location & { pollLogs: unknown[] };
    return {
      ...(rest as unknown as LocationRecord),
      lastPollSnapshot: latestLog?.snapshot ?? null,
      lastPolledAt: latestLog?.polledAt ?? null,
    };
  }

  async update(id: string, input: LocationUpdateInput): Promise<LocationRecord | null> {
    try {
      return (await this.prisma.location.update({ where: { id }, data: input })) as unknown as LocationRecord;
    } catch (err) {
      if (isPrismaNotFoundError(err)) return null;
      throw err;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.prisma.location.delete({ where: { id } });
      return true;
    } catch (err) {
      if (isPrismaNotFoundError(err)) return false;
      throw err;
    }
  }
}

export class PrismaAlertsRepo implements AlertsRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findByLocation(locationId: string, limit: number, offset: number): Promise<AlertEventRecord[]> {
    return this.prisma.alertEvent.findMany({
      where: { locationId },
      orderBy: { triggeredAt: "desc" },
      take: limit,
      skip: offset,
    }) as unknown as Promise<AlertEventRecord[]>;
  }

  async create(input: AlertEventCreateInput): Promise<AlertEventRecord> {
    return this.prisma.alertEvent.create({
      data: {
        locationId: input.locationId,
        triggerType: input.triggerType as never, // Prisma enum type; validated upstream by evaluateTriggers
        message: input.message,
        snapshot: input.snapshot as never, // Prisma Json input
      },
    }) as unknown as Promise<AlertEventRecord>;
  }
}

export class PrismaPollLogsRepo implements PollLogsRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findLatestPolledAt(locationId: string): Promise<Date | null> {
    const latest = await this.prisma.pollLog.findFirst({
      where: { locationId },
      orderBy: { polledAt: "desc" },
      select: { polledAt: true },
    });
    return latest?.polledAt ?? null;
  }

  async create(input: PollLogCreateInput): Promise<PollLogRecord> {
    return this.prisma.pollLog.create({
      data: {
        locationId: input.locationId,
        cacheHit: input.cacheHit,
        statusCode: input.statusCode,
        quotaRemaining: input.quotaRemaining,
        snapshot: input.snapshot !== undefined ? (input.snapshot as never) : undefined,
      },
    }) as unknown as Promise<PollLogRecord>;
  }
}

function isPrismaNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2025";
}
