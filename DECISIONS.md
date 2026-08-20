# DECISIONS.md — WeatherAI Alert Hub

This captures the reasoning behind non-obvious choices in this codebase —
context that isn't visible just from reading the files, but matters for
anyone (including future-me) picking this project back up.

## The core pitch

WeatherAI's Webhooks feature (push alerts on rain/wind/frost/drought) is
gated behind their Pro plan. This project reimplements that same
trigger-based alerting model on the **Free tier** (1,000 req/mo, no
webhooks) using scheduled polling instead of push, deliberately designed
around that quota constraint rather than ignoring it.

## Confirmed facts about the WeatherAI API (verified live, not assumed from docs)

- **Response shape** (`GET /v1/weather`): `{ lat, lon, units, days, current: {...}, daily: [...], hourly: [...] }`.
  Field names and `weathercode` values match the Open-Meteo schema (WMO
  weather interpretation codes) — WeatherAI appears to proxy Open-Meteo.
  Types live in `src/lib/weatherTypes.ts`, validated at runtime with Zod
  (`weatherApiResponseSchema`), so a schema drift throws a clear
  `WeatherApiValidationError` instead of silently corrupting data downstream.

- **No rate-limit headers, at all.** Confirmed via `curl -i` against a live
  key: only standard CDN/framework headers (`Cache-Control`, `Etag`,
  `Server`, `X-Powered-By`, `X-Country-Code`, etc.) — nothing
  `X-RateLimit-*`. This was a real bug, not a cosmetic gap: the quota
  tracker's header-parsing path silently never had data, so
  `hasHeadroom()` was returning `true` unconditionally forever — the
  quota gating that's the whole point of the project was inert against
  the real API despite passing tests (tests mock headers being present).
  **Fix:** `QuotaTracker` now self-tracks request counts in Redis against
  `WEATHERAI_MONTHLY_LIMIT` (documented plan cap), incrementing on every
  real (non-cached) attempt via `weatherClient.ts`. The header-parsing
  path is kept as a defensive fallback (in case a paid tier ever sends
  them) but is dead code against Free tier today — see the `source:
  "headers" | "self-tracked"` field on `QuotaState`.

## Trigger logic — what each one actually means

- **RAIN**: `current.weathercode` is in a WMO rain/drizzle/thunderstorm code
  set (`src/triggers/evaluator.ts`).
- **EXTREME_WIND**: `current.windspeed >= 60 km/h` (≈ gale force, Beaufort 8).
- **FROST**: `current.temperature <= 0°C`.
- **DROUGHT is not a real drought index.** WeatherAI's Free tier only
  returns a forward 7-day forecast, no historical precipitation. What's
  implemented is a *forward dry-spell check* (cumulative forecast
  precipitation under 5mm across the returned window), and the alert
  message says so explicitly ("forecast-based dry-spell signal, not a
  historical drought index") rather than overclaiming rigor it doesn't
  have.

## Architecture choices worth knowing

- **Routes depend on repo interfaces (`LocationsRepo`, `AlertsRepo`,
  `PollLogsRepo`), never on Prisma's generated client type directly**
  (`src/db/locationsRepo.ts`). This paid off immediately: Prisma v7
  changed its default generator mid-project (see below), and none of the
  route/test code had to change because of it. It also means the full
  route/poller test suite runs against in-memory fakes, no database
  required.

- **Prisma v7 breaking change**: the default generator moved from
  `prisma-client-js` (auto-outputs to `node_modules/@prisma/client`) to
  `prisma-client` (Rust-free, requires an explicit `output` path, and a
  driver adapter — `@prisma/adapter-pg` — instead of bare
  `new PrismaClient()`). Client lands at `src/generated/prisma` in this
  project (gitignored, regenerate with `npx prisma generate`). If
  `PrismaClient` import errors resurface, check `prisma/schema.prisma`'s
  generator block and the import path in `src/db/client.ts` first.

- **Caching**: Redis, keyed by coordinates rounded to 4 decimals (~11m
  precision) + units + days, so near-identical repeated polls of the same
  location share a cache entry instead of each burning a request.
  Default TTL 25 min (`WEATHER_CACHE_TTL_SECONDS`).

- **Retry/backoff**: exponential with jitter on 429/500/502/503/504, max 3
  retries. Every attempt (including retries) counts against the
  self-tracked quota — the conservative assumption, since WeatherAI
  doesn't document whether failed attempts count against their real cap.

- **Scheduler**: `node-cron`, ticks every `SCHEDULER_TICK_SECONDS` (default
  60s) just to check who's *due*. Actual per-location poll frequency is
  gated separately by `MIN_POLL_INTERVAL_SECONDS` (default 1800s / 30 min),
  read from the DB (`PollLog.polledAt`), so it survives server restarts —
  a location polled 5 minutes before a restart is still "not due" after
  restarting. This is the mechanism that keeps a multi-location setup
  inside the monthly cap as more locations are added.

- **Quota exhaustion stops the whole poll cycle**, not just one location.
  It's a global monthly cap, not per-location, so if the first due
  location hits `QuotaExceededError`, every other due location that tick
  is guaranteed to fail identically — `runPollCycle` breaks immediately
  rather than looping through certain failures.

## A real bug that shipped and how it was caught

`buildCronExpression(60)` produced `"* */1 * * * *"` — a `*` (wildcard) in
the leading **seconds** field instead of `0`. Since `*/1` in the minutes
field is always true anyway, this fired the poll cycle every **second**,
not every 60 seconds. It passed all unit tests because `startScheduler`
is tested with an injected fake `cronSchedule` function that only checked
the *string* — never fed to a real cron parser. Only caught by watching
real `npm run dev` logs. Fixed (seconds field is now `0`), and a
regression test was added that actually schedules the real `node-cron`
library and counts ticks over ~2s, specifically because the string-shape
tests structurally couldn't catch this class of bug.

**Lesson generalized**: when a function's output is a string interpreted
by an external parser (cron expressions, SQL, shell commands, regex),
testing the string's *shape* isn't enough — feed it to the real parser at
least once.

## Known gap, not yet fixed (as of last discussion)

The app only stores weather snapshots at the moment a trigger *matches*
(`AlertEvent.snapshot`). A location with no matches shows "no alerts
triggered yet" forever, with no visibility into current conditions or
proof that polling is even happening. `PollLog` records that a poll
happened but not what the weather was. Fix discussed but not built:
add `PollLog.snapshot` (raw weather data on every poll, not just matches),
surface it via `GET /locations/:id`, and show a "current conditions" card
on the frontend detail page above the alert history.

## Test status as of last full run

Backend: **72/72** passing across 5 files (poller 16, app 19, weatherClient
9, evaluator 16, quotaTracker 12). Frontend: `tsc --noEmit` and `next build`
both clean (Next.js 16 / React 19, App Router, client components only, no
server-side data fetching — talks to the backend via
`NEXT_PUBLIC_API_URL`).