"use client";

import { useState, type FormEvent } from "react";
import { MapPinPlus, Plus } from "lucide-react";
import { api, ApiError, type Location } from "@/lib/api";
import { ALL_TRIGGER_TYPES, TriggerBadge } from "@/components/TriggerBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AddLocationForm({ onCreated }: { onCreated: (location: Location) => void }) {
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(["RAIN"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTrigger(trigger: string) {
    setSelectedTriggers((prev) => (prev.includes(trigger) ? prev.filter((t) => t !== trigger) : [...prev, trigger]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError("Latitude must be a number between -90 and 90");
      return;
    }
    if (Number.isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setError("Longitude must be a number between -180 and 180");
      return;
    }
    if (selectedTriggers.length === 0) {
      setError("Select at least one trigger type");
      return;
    }

    setSubmitting(true);
    try {
      const location = await api.createLocation({
        label: label.trim(),
        lat: latNum,
        lon: lonNum,
        units,
        triggers: selectedTriggers,
      });
      onCreated(location);
      setLabel("");
      setLat("");
      setLon("");
      setSelectedTriggers(["RAIN"]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create location");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPinPlus className="size-4 text-primary" />
          Add a location
        </CardTitle>
        <CardDescription>Monitor rain, wind, frost, or drought without burning the free-tier quota.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nairobi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-1.2921"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lon">Longitude</Label>
              <Input
                id="lon"
                inputMode="decimal"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="36.8219"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Units</Label>
            <Select value={units} onValueChange={(value) => setUnits(value as "metric" | "imperial")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Metric (°C)</SelectItem>
                <SelectItem value="imperial">Imperial (°F)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Triggers to watch</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_TRIGGER_TYPES.map((trigger) => {
                const active = selectedTriggers.includes(trigger);
                return (
                  <button
                    type="button"
                    key={trigger}
                    onClick={() => toggleTrigger(trigger)}
                    className={active ? "rounded-full ring-2 ring-primary/40" : "rounded-full opacity-45 hover:opacity-80"}
                  >
                    <TriggerBadge trigger={trigger} />
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            <Plus data-icon="inline-start" />
            {submitting ? "Adding…" : "Add location"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
