import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  WEATHERAI_API_KEY: z.string().min(1, "WEATHERAI_API_KEY is required"),
  WEATHERAI_BASE_URL: z.string().url().default("https://api.weather-ai.co"),
  WEATHERAI_MONTHLY_LIMIT: z.coerce.number().int().positive().default(1000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  SCHEDULER_TICK_SECONDS: z.coerce.number().int().positive().default(60),
  MIN_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(1800),
  WEATHER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(1500),
  QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(20),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();