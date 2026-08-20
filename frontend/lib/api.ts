export const TRIGGER_TYPES = ["RAIN", "EXTREME_WIND", "FROST", "DROUGHT"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export interface Location {
  id: string;
  label: string;
  lat: number;
  lon: number;
  timezone: string;
  units: string;
  triggers: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  locationId: string;
  triggerType: string;
  message: string;
  snapshot: unknown;
  triggeredAt: string;
}

export interface QuotaState {
    limit: number;
    remaining: number;
    resetAt: string;
    source: "headers" | "self-tracked";
  }

export interface LocationCreateInput {
  label: string;
  lat: number;
  lon: number;
  timezone?: string;
  units?: "metric" | "imperial";
  triggers: string[];
}

export interface LocationUpdateInput {
  label?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  units?: "metric" | "imperial";
  triggers?: string[];
  active?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    let body: { error?: string; issues?: unknown } | null = null;
    try {
      body = await res.json();
    } catch {
      // response had no JSON body, fall through to the generic message
    }
    throw new ApiError(body?.error ?? `Request failed with status ${res.status}`, res.status, body?.issues);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  listLocations: (): Promise<Location[]> => request<Location[]>("/locations"),

  getLocation: (id: string): Promise<Location> => request<Location>(`/locations/${id}`),

  createLocation: (input: LocationCreateInput): Promise<Location> =>
    request<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),

  updateLocation: (id: string, input: LocationUpdateInput): Promise<Location> =>
    request<Location>(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  deleteLocation: (id: string): Promise<void> => request<void>(`/locations/${id}`, { method: "DELETE" }),

  getAlerts: (id: string, limit = 20, offset = 0): Promise<AlertEvent[]> =>
    request<AlertEvent[]>(`/locations/${id}/alerts?limit=${limit}&offset=${offset}`),

  getQuota: (): Promise<QuotaState> => request<QuotaState>("/quota"),
};