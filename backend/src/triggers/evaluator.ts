import type { TriggerType, WeatherPayload } from "../lib/weatherTypes";

export type TriggerMatch = {
  triggerType: TriggerType;
  reason: string;
  evidence: Record<string, unknown>;
};

/**
 * Rain / wind / frost / drought evaluation is blocked on a confirmed
 * `/v1/weather` response shape. Until then this returns no matches so the
 * poller can still run cache, quota, and audit logging.
 */
export function evaluateTriggers(
  payload: WeatherPayload,
  triggerTypes: TriggerType[],
): TriggerMatch[] {
  void payload;
  void triggerTypes;
  return [];
}
