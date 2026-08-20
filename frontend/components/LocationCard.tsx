import Link from "next/link";
import { History, MapPin, Trash2 } from "lucide-react";
import type { Location } from "@/lib/api";
import { TriggerBadges } from "@/components/TriggerBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LocationCard({ location, onDelete }: { location: Location; onDelete: (id: string) => void }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/locations/${location.id}`} className="font-heading text-base font-medium hover:underline">
              {location.label}
            </Link>
            {!location.active && <Badge variant="secondary">Paused</Badge>}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            {location.lat.toFixed(4)}, {location.lon.toFixed(4)} · {location.units}
          </p>
          <TriggerBadges triggers={location.triggers} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/locations/${location.id}`}>
              <History data-icon="inline-start" />
              History
            </Link>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onDelete(location.id)}>
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
