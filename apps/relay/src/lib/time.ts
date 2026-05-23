/** Time helpers. All timestamps in this service are unix milliseconds. */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Current time in unix milliseconds. */
export function now(): number {
  return Date.now();
}

export function addSeconds(ts: number, seconds: number): number {
  return ts + seconds * SECOND_MS;
}

export function addMinutes(ts: number, minutes: number): number {
  return ts + minutes * MINUTE_MS;
}

export function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

/** Render a unix-ms timestamp as an ISO-8601 datetime string (lexicon format). */
export function toIsoDatetime(ts: number): string {
  return new Date(ts).toISOString();
}
