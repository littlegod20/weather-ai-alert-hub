"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Droplets,
  LoaderCircle,
  MapPin,
  Moon,
  Pause,
  Play,
  Sun,
  Thermometer,
  Trash2,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { api, ApiError, type Location, type AlertEvent, type CurrentConditions } from "@/lib/api";
import { TriggerBadges } from "@/components/TriggerBadges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const PAGE_SIZE = 20;

// WMO Weather Interpretation Codes — https://open-meteo.com/en/docs#weathervariables
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Moderate showers",
  82: "Heavy showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeatherCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `Weather code ${code}`;
}

function describeWindDirection(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8] ?? "–";
}

function CurrentConditionsCard({
  conditions,
  units,
  lastPolledAt,
  aiSummary,
}: {
  conditions: CurrentConditions;
  units: string;
  lastPolledAt: string | null | undefined;
  aiSummary?: string;
}) {
  const tempUnit = units === "imperial" ? "°F" : "°C";
  const speedUnit = units === "imperial" ? "mph" : "km/h";
  const isDay = conditions.is_day === 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            {isDay ? <Sun className="size-4 text-yellow-500" /> : <Moon className="size-4 text-indigo-400" />}
            Current conditions
          </span>
          {lastPolledAt && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Clock className="size-3" />
              Last polled {new Date(lastPolledAt).toLocaleString()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Thermometer className="size-4 text-muted-foreground" />
            <span className="text-2xl font-semibold">
              {conditions.temperature}
              {tempUnit}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wind className="size-4" />
            <span>
              {conditions.windspeed} {speedUnit} {describeWindDirection(conditions.winddirection)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{describeWeatherCode(conditions.weathercode)}</Badge>
          </div>
        </div>

        {aiSummary && (
          <div className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Droplets className="mt-0.5 size-4 shrink-0" />
            <p>{aiSummary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [location, setLocation] = useState<Location | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [togglingActive, setTogglingActive] = useState(false);

  const loadLocation = useCallback(async () => {
    try {
      const data = await api.getLocation(id);
      setLocation(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Location not found" : "Failed to load location");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAlerts = useCallback(
    async (nextOffset: number) => {
      const page = await api.getAlerts(id, PAGE_SIZE, nextOffset);
      setAlerts((prev) => (nextOffset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
      setOffset(nextOffset + page.length);
    },
    [id],
  );

  useEffect(() => {
    loadLocation();
    loadAlerts(0);
  }, [loadLocation, loadAlerts]);

  async function handleToggleActive() {
    if (!location) return;
    setTogglingActive(true);
    try {
      const updated = await api.updateLocation(location.id, { active: !location.active });
      setLocation(updated);
    } catch {
      setError("Failed to update location");
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleDelete() {
    if (!location) return;
    try {
      await api.deleteLocation(location.id);
      router.push("/");
    } catch {
      setError("Failed to delete location");
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading location…
      </p>
    );
  }

  if (error && !location) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not load location</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="ghost" asChild>
          <Link href="/">
            <ArrowLeft data-icon="inline-start" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  if (!location) return null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/">
          <ArrowLeft data-icon="inline-start" />
          Dashboard
        </Link>
      </Button>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                {location.label}
                {!location.active && <Badge variant="secondary">Paused</Badge>}
              </CardTitle>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {location.lat.toFixed(4)}, {location.lon.toFixed(4)} · {location.units} · {location.timezone}
              </p>
              <TriggerBadges triggers={location.triggers} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleToggleActive} disabled={togglingActive}>
                {location.active ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                {location.active ? "Pause" : "Resume"}
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {location.lastPollSnapshot?.current ? (
        <CurrentConditionsCard
          conditions={location.lastPollSnapshot.current}
          units={location.units}
          lastPolledAt={location.lastPolledAt}
          aiSummary={location.lastPollSnapshot.ai_summary}
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No conditions data yet — waiting for the first poll.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Alert history</h2>
          <Separator className="flex-1" />
        </div>

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No alerts triggered yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {alerts.map((alert) => (
                <li key={alert.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <TriggerBadges triggers={[alert.triggerType]} />
                    <time className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {new Date(alert.triggeredAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-sm text-foreground">{alert.message}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {hasMore && (
          <Button variant="outline" size="sm" onClick={() => loadAlerts(offset)}>
            Load more
          </Button>
        )}
      </section>
    </div>
  );
}
