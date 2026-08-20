import pino from "pino";
import { getEnv } from "../config/env";

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: ["WEATHERAI_API_KEY", "req.headers.authorization"],
    censor: "[redacted]",
  },
  transport:
    getEnv().NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
});
