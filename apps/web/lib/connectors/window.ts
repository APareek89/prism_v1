// lib/connectors/window.ts
//
// Ingest-window helpers shared by every connector (architecture §0.5 / PRD §6).
//
//   • 28-day INGEST window  — the rolling compute window. Connectors pull PRs /
//     sessions / incidents whose activity falls in the last 28 days.
//   • 90-day SIZING window  — the wider window used to compute frozen S/M/L size
//     tertiles. PR diffs are sampled over 90 days so the bucket boundaries are
//     stable before the 28-day scoring window is sliced out.
//
// Pure date math (UTC), side-effect free, safe to import anywhere.

import { WINDOW_DAYS, SIZING_WINDOW_DAYS } from '@/lib/config/constants';

export { WINDOW_DAYS, SIZING_WINDOW_DAYS };

const DAY_MS = 86_400_000;

/** A `[since, until]` window as ISO-8601 timestamps (UTC). `until` is `now`. */
export interface IngestWindow {
  /** inclusive lower bound — `now - days` as an ISO timestamp. */
  since: string;
  /** upper bound — `now` as an ISO timestamp. */
  until: string;
  /** the raw bounds as Date objects (for in-memory comparisons). */
  sinceDate: Date;
  untilDate: Date;
  /** window width in days. */
  days: number;
}

/** Build a trailing window of `days` ending at `now` (default: real now). */
export function trailingWindow(days: number, now: Date = new Date()): IngestWindow {
  const untilDate = new Date(now.getTime());
  const sinceDate = new Date(now.getTime() - days * DAY_MS);
  return {
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
    sinceDate,
    untilDate,
    days,
  };
}

/** The 28-day rolling INGEST window (PRs / sessions / incidents in scope). */
export function ingestWindow(now: Date = new Date()): IngestWindow {
  return trailingWindow(WINDOW_DAYS, now);
}

/** The 90-day SIZING window (diff sampling for frozen S/M/L tertiles). */
export function sizingWindow(now: Date = new Date()): IngestWindow {
  return trailingWindow(SIZING_WINDOW_DAYS, now);
}

/** True when an ISO/Date timestamp falls inside the window (inclusive `since`). */
export function inWindow(ts: string | Date | null | undefined, win: IngestWindow): boolean {
  if (ts === null || ts === undefined) return false;
  const t = ts instanceof Date ? ts.getTime() : Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return t >= win.sinceDate.getTime() && t <= win.untilDate.getTime();
}
