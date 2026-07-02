// Trailing 28-day window + activity-day derivation + PR size buckets.
// asOf is derived FROM THE DATA (max activity timestamp) so the whole engine is
// deterministic — no wall clock anywhere.

import type { PrRow, SessionRow, CommitRow } from '@prism/contract';

export const WINDOW_DAYS = 28;

export function deriveWindow(prs: PrRow[], sessions: SessionRow[]): { date: string; startIso: string; endIso: string } {
  let maxTs = 0;
  for (const p of prs) if (p.merged_at) maxTs = Math.max(maxTs, Date.parse(p.merged_at));
  for (const s of sessions) maxTs = Math.max(maxTs, Date.parse(s.started_at));
  if (!maxTs) maxTs = Date.parse('2026-01-01T00:00:00Z');
  const end = new Date(maxTs);
  const date = end.toISOString().slice(0, 10);
  const endIso = `${date}T23:59:59.999Z`;
  const startIso = new Date(Date.parse(`${date}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86400_000).toISOString();
  return { date, startIso, endIso };
}

export const inWindow = (iso: string | null, startIso: string, endIso: string): boolean =>
  iso !== null && iso >= startIso && iso <= endIso;

export const utcDay = (iso: string): string => iso.slice(0, 10);

/** Working days = distinct UTC days with ANY activity (session, PR merge, commit). */
export function activityDays(
  sessions: SessionRow[], prs: PrRow[], commits: CommitRow[],
): { workingDays: Set<string>; sessionDays: Set<string> } {
  const workingDays = new Set<string>();
  const sessionDays = new Set<string>();
  for (const s of sessions) { workingDays.add(utcDay(s.started_at)); sessionDays.add(utcDay(s.started_at)); }
  for (const p of prs) if (p.merged_at) workingDays.add(utcDay(p.merged_at));
  for (const c of commits) workingDays.add(utcDay(c.authored_at));
  return { workingDays, sessionDays };
}

// PR sizing (KPI 4 fairness): raw size = files + hunks + 2·modules + 3·blast;
// tertile cutoffs over the window's merged PRs (published per run).
export type SizeBucket = 'S' | 'M' | 'L';

export const rawSize = (pr: Pick<PrRow, 'files_changed' | 'hunks' | 'modules' | 'blast'>): number =>
  pr.files_changed + pr.hunks + 2 * pr.modules + (pr.blast ? 3 : 0);

export function sizeCutoffs(mergedPrs: PrRow[]): { t1: number; t2: number } {
  const sizes = mergedPrs.map(rawSize).sort((a, b) => a - b);
  if (sizes.length < 3) return { t1: 10, t2: 25 };   // published cold-start cutoffs
  const at = (q: number) => sizes[Math.min(sizes.length - 1, Math.floor(q * sizes.length))]!;
  return { t1: at(1 / 3), t2: at(2 / 3) };
}

export const bucketOf = (pr: PrRow, cutoffs: { t1: number; t2: number }): SizeBucket => {
  const s = rawSize(pr);
  return s <= cutoffs.t1 ? 'S' : s <= cutoffs.t2 ? 'M' : 'L';
};
