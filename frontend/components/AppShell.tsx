import type { ReactNode } from "react";
import Link from "next/link";
import { CloudSun } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,oklch(0.92_0.04_195/0.7),transparent_65%)]"
      />
      <header className="relative z-10 border-b border-border/70 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-foreground">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CloudSun className="size-4" />
            </span>
            <span className="font-heading text-sm font-semibold tracking-tight">WeatherAI Alert Hub</span>
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">Quota-aware weather triggers</span>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
