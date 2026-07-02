// lib/db/_base.ts
//
// Shared plumbing for the lib/db read modules (architecture §3). Server-only.
//
//   • the RLS server client (via lib/supabase/server) wrapped in appTable() — the
//     generated `Database` placeholder has empty Tables, so every query goes through
//     the loosely-typed escape hatch and is cast to the hand-authored row types in
//     @/lib/types at the call site.
//   • the current bootstrap function + current employee resolvers.
//   • trailing-window date math (28d compute / 90d sizing) + Period → trend
//     granularity / delta baseline (PRESENTATION ONLY — no scoring here).
//   • the row→DTO mapping helpers every domain module reuses (band label + blurb,
//     confidence band → DTO name + pct, delta formatting, period labels).
//
// EVERY read returns a safe empty/awaiting-signal shape when there are no rows — the
// schema is live but empty until M3, so nulls / [] / 'Insufficient' / suppressed are
// the default, never fabricated numbers.
//
// SERVER-ONLY: these modules import lib/supabase/server (next/headers) and must never
// be pulled into a client bundle. No bare `server-only` import — that package is not a
// direct dependency here; the next/headers transitive import enforces the boundary.

import { appTable, createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isConfigured } from '@/lib/config/env';
import { isDemoMode } from '@/lib/config/flags';
import { getAuthUser } from '@/lib/auth/session';
import type { AuthUser } from '@/lib/types';
import { DIMENSION_HUES } from '@/app/tokens';
import {
  WINDOW_DAYS,
  SIZING_WINDOW_DAYS,
  CONFIDENCE_THRESHOLDS,
  type Period,
} from '@/lib/config/constants';
import type {
  ConfidenceBandName,
  DeltaDTO,
  DeltaDir,
  Dimension,
  DimensionTag,
  BandLabel,
} from '@/lib/ui/view-models';
import { DIMENSION_TAG } from '@/lib/ui/view-models';

// ─────────────────────────────────────────────────────────────────────────────
// Client + minimal loose query surface
// ─────────────────────────────────────────────────────────────────────────────

/** A read-only loose query builder (subset of the appTable() surface). */
export interface DbReadQuery {
  select: (cols: string) => DbReadFilter;
}
export interface DbReadFilter extends Promise<{ data: unknown; error: unknown }> {
  eq: (col: string, val: unknown) => DbReadFilter;
  order: (col: string, opts?: unknown) => DbReadFilter;
  limit: (n: number) => DbReadFilter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}
export interface DbReadClient {
  from: (table: string) => DbReadQuery;
}

/**
 * The RLS-scoped read client for the current request. Wrapped in appTable() because
 * the generated `Database` placeholder has no Tables yet (tighten once
 * `npm run db:types` runs). Each call constructs a per-request client (cookies/JWT).
 */
export async function db(): Promise<DbReadClient> {
  // Dev bypass + real RLS (architecture §0.7): in DEMO_MODE there is no real Supabase
  // auth session, so the RLS client (anon, auth.uid() null) is denied by every policy.
  // The demo is a single user holding all roles locally, so reads go through the
  // service-role client (bypasses RLS) — there is no cross-user boundary to protect.
  // Production (DEMO_MODE off) uses the real RLS client so policies are enforced.
  if (isDemoMode() && isConfigured('supabase')) {
    return createAdminClient() as unknown as DbReadClient;
  }
  const supabase = await createClient();
  return appTable(supabase) as unknown as DbReadClient;
}

/** Narrow a loose `{ data, error }` result to an array of plain rows. */
function rows(result: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) return [];
  return result.data as Record<string, unknown>[];
}

/** Run a query and return its rows, swallowing errors to an empty list (keyless / empty-DB safe). */
export async function selectRows(filter: DbReadFilter): Promise<Record<string, unknown>[]> {
  try {
    return rows(await filter);
  } catch {
    return [];
  }
}

/** Run a maybeSingle() query, returning null on error/empty. */
export async function selectOne(
  fn: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await fn();
    return error ? null : data;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity: current function + current employee
// ─────────────────────────────────────────────────────────────────────────────

/** Re-export the one auth resolver so view RSCs can read the current employee. */
export { getAuthUser };

/**
 * The single bootstrap function's id. Resolution order:
 *   1. the current auth user's functionId (demo or real), if present;
 *   2. the single `functions` row (the demo has exactly one);
 *   3. null when the schema is empty and there is no user.
 */
export async function getCurrentFunctionId(): Promise<string | null> {
  const user = await getAuthUser();
  if (user?.functionId) return user.functionId;

  const client = await db();
  const fn = await selectOne(() => client.from('functions').select('id').limit(1).maybeSingle());
  return (fn?.id as string | undefined) ?? null;
}

/** The current employee's id, or null when unauthenticated. */
export async function getCurrentEmployeeId(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.employeeId ?? null;
}

/** The full current AuthUser (or null) — convenience re-export wrapper. */
export async function currentUser(): Promise<AuthUser | null> {
  return getAuthUser();
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows (presentation): trailing dates + Period granularity / delta baseline
// ─────────────────────────────────────────────────────────────────────────────

export { WINDOW_DAYS, SIZING_WINDOW_DAYS };

/** ISO `YYYY-MM-DD` for `now` minus `days` (UTC). `now` injectable for tests. */
export function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** The trailing-28-day compute window as `[startInclusive, endInclusive]` ISO dates. */
export function computeWindow(now: Date = new Date()): { start: string; end: string } {
  return { start: isoDaysAgo(WINDOW_DAYS - 1, now), end: isoDaysAgo(0, now) };
}

/** Per-Period presentation config: trend granularity label + how far back the delta baseline sits. */
export interface PeriodView {
  /** trend granularity label, e.g. "last 28 days". */
  granularityLabel: string;
  /** how many points the trend series shows (presentation cap). */
  points: number;
  /** baseline offset for the delta, e.g. "vs yesterday / last week / last month". */
  deltaBaselineLabel: string;
  /** period label for the meta strip, e.g. "Wk 26 · 2026". */
  periodLabel: (now: Date) => string;
}

/** Resolve a Period into presentation-only trend granularity + delta baseline. */
export function periodView(period: Period): PeriodView {
  switch (period) {
    case 'daily':
      return {
        granularityLabel: 'last 28 days',
        points: 28,
        deltaBaselineLabel: 'vs yesterday',
        periodLabel: (now) => fmtDayLabel(now),
      };
    case 'monthly':
      return {
        granularityLabel: 'last 12 months',
        points: 12,
        deltaBaselineLabel: 'vs last month',
        periodLabel: (now) => fmtMonthLabel(now),
      };
    case 'weekly':
    default:
      return {
        granularityLabel: 'last 12 weeks',
        points: 12,
        deltaBaselineLabel: 'vs last week',
        periodLabel: (now) => fmtWeekLabel(now),
      };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 30 Jun" */
export function fmtDayLabel(d: Date): string {
  const wd = WEEKDAYS[d.getUTCDay()] ?? '';
  const mon = MONTHS[d.getUTCMonth()] ?? '';
  return `${wd} ${d.getUTCDate()} ${mon}`.trim();
}

/** "Jun 2026" */
export function fmtMonthLabel(d: Date): string {
  const mon = MONTHS[d.getUTCMonth()] ?? '';
  return `${mon} ${d.getUTCFullYear()}`.trim();
}

/** "Wk 26 · 2026" (ISO week number). */
export function fmtWeekLabel(d: Date): string {
  return `Wk ${isoWeek(d)} · ${d.getUTCFullYear()}`;
}

/** ISO-8601 week number (1–53). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** The fixed trailing-window label every meta strip shows. */
export const WINDOW_LABEL = `trailing ${WINDOW_DAYS}d rolling`;

// ─────────────────────────────────────────────────────────────────────────────
// Row → DTO mapping helpers (band / confidence / delta / dimensions)
// ─────────────────────────────────────────────────────────────────────────────

/** L0–L5 band label from an L1 score (mirrors the reference `bandOf`). null → null. */
export function bandLabelFor(l1: number | null): BandLabel | null {
  if (l1 === null) return null;
  if (l1 >= 85) return 'L5 · Multiplier';
  if (l1 >= 70) return 'L4 · Power';
  if (l1 >= 55) return 'L3 · Workflow';
  if (l1 >= 35) return 'L2 · Productive';
  if (l1 >= 1) return 'L1 · Basic';
  return 'L0 · Dormant';
}

/**
 * L0–L5 band label from the ENGINE's stored band enum ('L0'..'L5'). Unlike bandLabelFor
 * (which buckets by L1 alone), this honors the engine's banding — including the L0 gate:
 * a member with a real L1 but no AI-linked delivery is Dormant (L0), not the level their
 * raw L1 would imply. Falls back to null for an unknown/missing band.
 */
export function bandLabelForStored(band: string | null | undefined): BandLabel | null {
  switch (band) {
    case 'L0':
      return 'L0 · Dormant';
    case 'L1':
      return 'L1 · Basic';
    case 'L2':
      return 'L2 · Productive';
    case 'L3':
      return 'L3 · Workflow';
    case 'L4':
      return 'L4 · Power';
    case 'L5':
      return 'L5 · Multiplier';
    default:
      return null;
  }
}

/** A one-line blurb for each band (from the design vocabulary). null when no band. */
export function bandBlurbFor(label: BandLabel | null): string | null {
  if (!label) return null;
  if (label.startsWith('L5')) return 'AI authorship compounds — shared skills lift the whole squad.';
  if (label.startsWith('L4')) return 'AI lives inside recurring workflows; outputs ship.';
  if (label.startsWith('L3')) return 'AI is woven into day-to-day work and merges land.';
  if (label.startsWith('L2')) return 'AI assists routinely, with room to tighten the loop.';
  if (label.startsWith('L1')) return 'Early, ad-hoc AI use — the habit is forming.';
  return 'No sustained AI activity yet — awaiting signal.';
}

/** Map a stored DB confidence band string to the DTO ConfidenceBandName. */
export function confidenceName(band: string | null | undefined): ConfidenceBandName {
  switch (band) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'Insufficient';
  }
}

/** Convert a 0–1 confidence score to a 0–100 pct for the little bar. null → 0. */
export function confidencePct(score: number | null | undefined): number {
  if (score === null || score === undefined || Number.isNaN(score)) return 0;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/**
 * A representative 0–100 pct for the little confidence bar, derived from the stored
 * `index_daily.confidence` band enum (high|medium|low|insufficient). There is no
 * numeric confidence column in the schema — the band IS the confidence — so the bar
 * shows a band-anchored level rather than a fabricated fraction.
 */
export function confidencePctForBand(band: string | null | undefined): number {
  switch (band) {
    case 'high':
      return 100;
    case 'medium':
      return 66;
    case 'low':
      return 33;
    default:
      return 0;
  }
}

/** Whether L1 should be suppressed based on the stored confidence band (below 'low'). */
export function isSuppressedBand(band: string | null | undefined): boolean {
  return band !== 'high' && band !== 'medium' && band !== 'low';
}

/** Derive a confidence band name from a raw 0–1 score (when no band column is present). */
export function nameForScore(score: number | null | undefined): ConfidenceBandName {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Insufficient';
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'High';
  if (score >= CONFIDENCE_THRESHOLDS.medium) return 'Medium';
  if (score >= CONFIDENCE_THRESHOLDS.low) return 'Low';
  return 'Insufficient';
}

/** Whether L1 should be suppressed (confidence below the floor). */
export function isSuppressed(score: number | null | undefined): boolean {
  if (score === null || score === undefined || Number.isNaN(score)) return true;
  return score < CONFIDENCE_THRESHOLDS.low; // low === SUPPRESS_L1_BELOW (0.40)
}

const MINUS = '−'; // U+2212 minus, matches the design glyph
const FLAT = '―';

/** Build a DeltaDTO from a numeric delta. null delta → null (no fabricated arrow). */
export function deltaDto(delta: number | null | undefined): DeltaDTO | null {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  let dir: DeltaDir;
  let label: string;
  if (rounded > 0) {
    dir = 'up';
    label = `+${rounded}`;
  } else if (rounded < 0) {
    dir = 'down';
    label = `${MINUS}${Math.abs(rounded)}`;
  } else {
    dir = 'flat';
    label = FLAT;
  }
  return { dir, label };
}

/** The four dimensions in canonical render order. */
export const DIMENSIONS: readonly Dimension[] = [
  'usage',
  'efficiency',
  'effectiveness',
  'proficiency',
] as const;

export const DIMENSION_LABEL: Record<Dimension, string> = {
  usage: 'Usage / AI-depth',
  efficiency: 'Efficiency',
  effectiveness: 'Effectiveness',
  proficiency: 'Proficiency',
};

/** Default L2 dimension weights (config v1) as whole-number percentages. */
export const DEFAULT_WEIGHT_PCT: Record<Dimension, number> = {
  usage: 10,
  efficiency: 25,
  effectiveness: 40,
  proficiency: 25,
};

export { DIMENSION_TAG, DIMENSION_HUES };
export type { Dimension, DimensionTag };

/** The `index_daily` L2 column name for each dimension. */
export const L2_COLUMN: Record<Dimension, string> = {
  usage: 'l2_usage',
  efficiency: 'l2_eff',
  effectiveness: 'l2_effness',
  proficiency: 'l2_prof',
};
