"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Gauge, LoaderCircle } from "lucide-react";
import { api, type QuotaState } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function QuotaBanner() {
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const state = await api.getQuota();
        if (!cancelled) {
          setQuota(state);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach the backend");
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Backend unreachable</AlertTitle>
        <AlertDescription>
          {error}. Make sure the API is running on the configured URL.
        </AlertDescription>
      </Alert>
    );
  }

  if (!quota) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Checking WeatherAI quota…
        </CardContent>
      </Card>
    );
  }

  if (!quota.known) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Gauge className="size-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">Quota not yet known</p>
            <p className="text-muted-foreground">No WeatherAI request has been made this process.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const remaining = quota.remaining ?? 0;
  const limit = quota.limit ?? 0;
  const pct = limit > 0 ? (remaining / limit) * 100 : 0;
  const usedPct = Math.max(0, Math.min(100, 100 - pct));
  const low = pct < 20;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">WeatherAI quota</p>
            <p className={low ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground"}>
              <span className="font-medium text-foreground">{remaining}</span> / {limit} requests remaining
              {quota.resetAt ? ` · resets ${new Date(quota.resetAt).toLocaleString()}` : ""}
            </p>
          </div>
        </div>
        <Progress value={usedPct} className={low ? "[&_[data-slot=progress-indicator]]:bg-amber-500" : undefined} />
      </CardContent>
    </Card>
  );
}
