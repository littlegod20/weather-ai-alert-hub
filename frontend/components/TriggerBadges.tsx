import type { LucideIcon } from "lucide-react";
import { CloudRain, Snowflake, Sun, Wind } from "lucide-react";
import type { TriggerType } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TRIGGER_META: Record<
  string,
  { label: string; icon: LucideIcon; className: string }
> = {
  RAIN: {
    label: "Rain",
    icon: CloudRain,
    className: "border-sky-200/80 bg-sky-50 text-sky-800 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-200",
  },
  EXTREME_WIND: {
    label: "Extreme wind",
    icon: Wind,
    className:
      "border-violet-200/80 bg-violet-50 text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-200",
  },
  FROST: {
    label: "Frost",
    icon: Snowflake,
    className:
      "border-cyan-200/80 bg-cyan-50 text-cyan-800 dark:border-cyan-800/50 dark:bg-cyan-950/40 dark:text-cyan-200",
  },
  DROUGHT: {
    label: "Drought",
    icon: Sun,
    className:
      "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200",
  },
};

export function TriggerBadge({ trigger }: { trigger: string }) {
  const meta = TRIGGER_META[trigger];
  const Icon = meta?.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", meta?.className)}>
      {Icon ? <Icon data-icon="inline-start" /> : null}
      {meta?.label ?? trigger}
    </Badge>
  );
}

export function TriggerBadges({ triggers }: { triggers: string[] }) {
  if (triggers.length === 0) {
    return <span className="text-xs text-muted-foreground">No triggers configured</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {triggers.map((t) => (
        <TriggerBadge key={t} trigger={t} />
      ))}
    </div>
  );
}

export const ALL_TRIGGER_TYPES: TriggerType[] = ["RAIN", "EXTREME_WIND", "FROST", "DROUGHT"];
