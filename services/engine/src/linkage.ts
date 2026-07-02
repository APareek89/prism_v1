// 🔗 The linkage engine (ex-KPI 11) — NEVER scored, insights only.
// Tests, WITHIN-PERSON, whether a harness gap explains an outcome problem
// (spec §3). Selection-bias guard: same person, practice-present vs
// practice-absent groups; an empty group → honest 'insufficient', never 0.

import type { PrRow } from '@prism/contract';
import { round1 } from './normalize';
import { aiPrs, sessionsForPr, reworkTier, type DevContext } from './kpis';
import { prKey } from './link';

export interface LinkageFinding {
  key: 'verification' | 'review_loop' | 'continuity' | 'skills';
  status: 'confirmed' | 'no_edge' | 'insufficient';
  withCount: number;
  withoutCount: number;
  withValue: number | null;    // outcome metric for the practice-present group
  withoutValue: number | null; // …and the practice-absent group
  unit: string;
  detail: string;
}

const DAY_MS = 86400_000;

function badOutcome(ctx: DevContext, pr: PrRow): boolean {
  const reverted = ctx.revertPrs.some(
    (r) => r.repo === pr.repo && r.revert_of === pr.number && r.merged_at && pr.merged_at &&
      Date.parse(r.merged_at) - Date.parse(pr.merged_at) <= 14 * DAY_MS);
  const reworked = ctx.commits.some(
    (c) => c.hunk_overlap_pr === pr.number && pr.merged_at &&
      Date.parse(c.authored_at) >= Date.parse(pr.merged_at) &&
      Date.parse(c.authored_at) - Date.parse(pr.merged_at) <= 14 * DAY_MS && reworkTier(c) !== null);
  return reverted || reworked;
}

const badRate = (ctx: DevContext, prs: PrRow[]): number | null =>
  prs.length ? round1((prs.filter((p) => badOutcome(ctx, p)).length / prs.length) * 100) : null;

function verdict(
  key: LinkageFinding['key'], withPrs: number, withoutPrs: number,
  withValue: number | null, withoutValue: number | null, unit: string,
  minGroup: number, gap: number, detail: string,
): LinkageFinding {
  const base = { key, withCount: withPrs, withoutCount: withoutPrs, withValue, withoutValue, unit, detail };
  if (withPrs < minGroup || withoutPrs < minGroup || withValue === null || withoutValue === null) {
    return { ...base, status: 'insufficient' };
  }
  return { ...base, status: withoutValue - withValue >= gap ? 'confirmed' : 'no_edge' };
}

export function runLinkage(ctx: DevContext): LinkageFinding[] {
  const ai = aiPrs(ctx);
  const findings: LinkageFinding[] = [];

  // 13 → 7/10: revert+rework rate on PRs WITH in-session verification vs WITHOUT.
  const verified = ai.filter((p) => sessionsForPr(ctx, p).some((s) => s.verification_events.length > 0));
  const unverified = ai.filter((p) => !verified.includes(p));
  findings.push(verdict('verification', verified.length, unverified.length,
    badRate(ctx, verified), badRate(ctx, unverified), '% bad outcome', 1, 15,
    'revert+rework rate on verified vs unverified AI PRs (same person)'));

  // 14 → 7: revert rate with vs without a pre-PR review pass.
  const looped = ai.filter((p) => sessionsForPr(ctx, p).some(
    (s) => s.review_pass?.ran && (s.review_pass.diff_changed || s.review_pass.findings === 0)));
  const unlooped = ai.filter((p) => !looped.includes(p));
  findings.push(verdict('review_loop', looped.length, unlooped.length,
    badRate(ctx, looped), badRate(ctx, unlooped), '% bad outcome', 1, 15,
    'revert+rework rate on review-looped vs unlooped AI PRs (same person)'));

  // 15 → 4/6: turns on warm-start vs cold-start sessions (connected repos).
  const connected = ctx.sessions.filter((s) => s.repo !== null && ctx.connected.has(s.repo));
  const warm = connected.filter((s) => s.context_read_at_start);
  const cold = connected.filter((s) => !s.context_read_at_start);
  const avgTurns = (xs: typeof connected): number | null =>
    xs.length ? round1(xs.reduce((a, s) => a + s.turns, 0) / xs.length) : null;
  const warmT = avgTurns(warm);
  const coldT = avgTurns(cold);
  findings.push(verdict('continuity', warm.length, cold.length, warmT, coldT, 'avg turns', 3,
    warmT !== null ? Math.max(2, warmT * 0.4) : 2,
    'avg session turns, warm-start vs cold-start (same person)'));

  // 12 → 4: turns on skill-backed vs ad-hoc sessions.
  const skillBacked = connected.filter((s) => s.skill_invocations.some((i) => i.had_output));
  const adHoc = connected.filter((s) => !skillBacked.includes(s));
  const skillT = avgTurns(skillBacked);
  const adHocT = avgTurns(adHoc);
  findings.push(verdict('skills', skillBacked.length, adHoc.length, skillT, adHocT, 'avg turns', 3,
    skillT !== null ? Math.max(2, skillT * 0.4) : 2,
    'avg session turns, skill-backed vs ad-hoc (same person)'));

  return findings;
}

/** PR keys with an unsuppressed link, for external evidence lists. */
export const linkedPrKeys = (ctx: DevContext): string[] =>
  aiPrs(ctx).map((p) => prKey(p.repo, p.number));
