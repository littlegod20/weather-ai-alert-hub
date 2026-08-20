import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default("info"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  WEATHERAI_API_KEY: z.string().min(1),
  WEATHERAI_BASE_URL: z.string().url().default("https://api.weather-ai.co"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().positive().default(60),
  MIN_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(1500),
  WEATHER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(1500),
  QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(20),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function getEnv(): Env {
  return cached ?? loadEnv();
}

export function resetEnv(): void {
  cached = undefined;
}
