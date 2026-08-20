"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Gauge, Info, LoaderCircle } from "lucide-react";
import { api, type QuotaState } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

  const { remaining, limit, resetAt, source } = quota;
  const pctRemaining = limit > 0 ? (remaining / limit) * 100 : 0;
  const usedPct = Math.max(0, Math.min(100, 100 - pctRemaining));
  const low = pctRemaining < 20;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">WeatherAI quota</p>
              {source === "self-tracked" && (
                <Badge variant="secondary" className="font-normal">
                  Estimated
                </Badge>
              )}
            </div>
            <p className={low ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground"}>
              <span className="font-medium text-foreground">{remaining}</span> / {limit} requests remaining
              {resetAt ? ` · resets ${new Date(resetAt).toLocaleString()}` : ""}
            </p>
            {source === "self-tracked" && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                WeatherAI does not report real-time quota; this count is tracked locally.
              </p>
            )}
          </div>
        </div>
        <Progress
          value={usedPct}
          className={low ? "**:data-[slot=progress-indicator]:bg-amber-500" : undefined}
        />
      </CardContent>
    </Card>
  );
}
