// lib/scoring/window.ts
//
// Window resolution (PRD §4.6, §4.3). Pure: the run date is ALWAYS passed in as a
// 'YYYY-MM-DD' string — never read from a clock. We do date arithmetic on UTC
// calendar days so the same run date always yields the same window (determinism).
//
//   compute window  = trailing 28 days (the score window — never changes)
//   sizing window   = trailing 90 days (frozen S/M/L tertiles)
//
// The Daily/Weekly/Monthly toggle resolves to a *trend granularity* + a *delta
// baseline* (vs yesterday / last week / last month). This is PRESENTATION ONLY and
// never alters the 28-day score window (PRD §4.6).

import {
  COMPUTE_WINDOW_DAYS,
  SIZING_WINDOW_DAYS,
} from './constants';

export type Period = 'daily' | 'weekly' | 'monthly';

/** An inclusive [start, end] window of calendar days (YYYY-MM-DD). */
export interface DateWindow {
  start: string;
  end: string;
  days: number;
}

/** Trend granularity the dashboard buckets by, derived from the period toggle. */
export type TrendGranularity = 'day' | 'week' | 'month';

export interface ResolvedWindow {
  runDate: string;
  /** the 28-day score window (the only window that feeds the index). */
  compute: DateWindow;
  /** the 90-day sizing-tertile window. */
  sizing: DateWindow;
  /** presentation: how to bucket the trend line. */
  trendGranularity: TrendGranularity;
  /** presentation: the prior-period date the daily delta compares against. */
  deltaBaselineDate: string;
}

const MS_PER_DAY = 86_400_000;

/** Parse a 'YYYY-MM-DD' run date into a UTC-midnight epoch. Throws on bad input
 *  (callers pass a validated date; this guards determinism). */
function parseDate(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid run date "${date}" (expected YYYY-MM-DD)`);
  const [, y, mo, d] = m;
  const ts = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  // Round-trip check rejects impossible dates like 2026-02-30.
  if (formatDate(ts) !== date) {
    throw new Error(`Invalid calendar date "${date}"`);
  }
  return ts;
}

/** Format a UTC epoch back to 'YYYY-MM-DD'. */
function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Add (or subtract) whole days to a 'YYYY-MM-DD' date, returning 'YYYY-MM-DD'. */
export function addDays(date: string, delta: number): string {
  return formatDate(parseDate(date) + delta * MS_PER_DAY);
}

/** Build a trailing window of `days` ending (inclusive) on `end`. */
function trailingWindow(end: string, days: number): DateWindow {
  const endTs = parseDate(end);
  const start = formatDate(endTs - (days - 1) * MS_PER_DAY);
  return { start, end, days };
}

/** The granularity + baseline offset implied by the period toggle. */
function periodPresentation(period: Period): {
  granularity: TrendGranularity;
  baselineOffsetDays: number;
} {
  switch (period) {
    case 'daily':
      return { granularity: 'day', baselineOffsetDays: 1 };
    case 'weekly':
      return { granularity: 'week', baselineOffsetDays: 7 };
    case 'monthly':
      return { granularity: 'month', baselineOffsetDays: 30 };
  }
}

/**
 * Resolve the full window context for a run date + dashboard period.
 *
 * The compute (28d) and sizing (90d) windows are independent of `period`; only the
 * trend granularity + delta baseline depend on it (presentation only).
 */
export function resolveWindow(
  runDate: string,
  period: Period = 'daily',
): ResolvedWindow {
  // Validate the date up front (also throws on impossible calendar dates).
  parseDate(runDate);
  const { granularity, baselineOffsetDays } = periodPresentation(period);
  return {
    runDate,
    compute: trailingWindow(runDate, COMPUTE_WINDOW_DAYS),
    sizing: trailingWindow(runDate, SIZING_WINDOW_DAYS),
    trendGranularity: granularity,
    deltaBaselineDate: addDays(runDate, -baselineOffsetDays),
  };
}

/** True when `date` (YYYY-MM-DD) falls within [window.start, window.end] inclusive. */
export function isWithinWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}
