"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MapPin, TriangleAlert } from "lucide-react";
import { api, ApiError, type Location } from "@/lib/api";
import { QuotaBanner } from "@/components/QuotaBanner";
import { AddLocationForm } from "@/components/AddLocationForm";
import { LocationCard } from "@/components/LocationCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function HomePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listLocations();
      setLocations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load locations, is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreated(location: Location) {
    setLocations((prev) => [location, ...prev]);
  }

  async function handleDelete(id: string) {
    const previous = locations;
    setLocations((prev) => prev.filter((l) => l.id !== id));
    try {
      await api.deleteLocation(id);
    } catch {
      setLocations(previous);
      setError("Failed to delete location");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Watch locations on the free tier without burning the monthly request cap.</p>
      </div>

      <QuotaBanner />
      <AddLocationForm onCreated={handleCreated} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Monitored locations</h2>
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{locations.length}</span>
        </div>

        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading locations…
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Could not load locations</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && locations.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
            <MapPin className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No locations yet</p>
            <p className="text-sm text-muted-foreground">Add one above to start monitoring.</p>
          </div>
        )}

        <div className="space-y-3">
          {locations.map((location) => (
            <LocationCard key={location.id} location={location} onDelete={handleDelete} />
          ))}
        </div>
      </section>
    </div>
  );
}
