import { getEnv } from "../config/env";
import { getRedis } from "./redis";
import type { QuotaState } from "./weatherTypes";

export const QUOTA_REDIS_KEY = "weatherai:quota";

const HEADER_LIMIT = "x-ratelimit-limit";
const HEADER_REMAINING = "x-ratelimit-remaining";
const HEADER_RESET = "x-ratelimit-reset";

export type HeaderSource =
  | Headers
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | undefined | null>;

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    const value = (headers as Headers).get(name);
    return value == null || value === "" ? undefined : value;
  }

  const record = headers as Record<string, string | string[] | undefined | null>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
  if (!key) return undefined;
  const value = record[key];
  if (Array.isArray(value)) return value[0];
  return value == null || value === "" ? undefined : value;
}

function parseIntHeader(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRateLimitHeaders(headers: HeaderSource, now = new Date()): QuotaState | null {
  const limit = parseIntHeader(readHeader(headers, HEADER_LIMIT));
  const remaining = parseIntHeader(readHeader(headers, HEADER_REMAINING));
  const resetAt = parseIntHeader(readHeader(headers, HEADER_RESET));
  if (limit == null || remaining == null || resetAt == null) return null;

  return {
    limit,
    remaining,
    resetAt,
    updatedAt: now.toISOString(),
  };
}

export async function saveQuota(state: QuotaState): Promise<void> {
  const ttlSeconds = Math.max(state.resetAt - Math.floor(Date.now() / 1000), 60);
  await getRedis().set(QUOTA_REDIS_KEY, JSON.stringify(state), "EX", ttlSeconds);
}

export async function getQuota(): Promise<QuotaState | null> {
  const raw = await getRedis().get(QUOTA_REDIS_KEY);
  if (raw == null) return null;
  return JSON.parse(raw) as QuotaState;
}

export function hasQuotaHeadroom(
  quota: QuotaState | null,
  buffer = getEnv().QUOTA_SAFETY_BUFFER,
  nowMs = Date.now(),
): boolean {
  if (!quota) return true;
  if (quota.resetAt * 1000 <= nowMs) return true;
  return quota.remaining > buffer;
}

export async function canIssueRequest(nowMs = Date.now()): Promise<{
  allowed: boolean;
  quota: QuotaState | null;
}> {
  const quota = await getQuota();
  return { allowed: hasQuotaHeadroom(quota, getEnv().QUOTA_SAFETY_BUFFER, nowMs), quota };
}
