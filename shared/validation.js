// shared/validation.js

import { MIN_INTERVAL_MS } from "./types.js";

export function validateConfig(config) {
  const errors = [];
  if (config.intervalMs < MIN_INTERVAL_MS) {
    errors.push(`Interval must be at least ${MIN_INTERVAL_MS} ms`);
  }
  if (config.durationSec <= 0) {
    errors.push("Duration must be positive");
  }
  if (config.startMode === "timeOfDay" && !/^\d{2}:\d{2}$/.test(config.startTimeHHMM || "")) {
    errors.push("Invalid time format; expected HH:MM");
  }
  return errors;
}
