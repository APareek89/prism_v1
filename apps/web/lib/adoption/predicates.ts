// lib/adoption/predicates.ts
//
// PURE re-verification predicates (M4 · A2). One predicate per rule (keyed by detected_via).
// Each re-reads the SAME evidence the rule fired on (via a fresh RuleContext) and, using the
// SAME thresholds (lib/recommendations/thresholds.ts), emits an AdoptionSignal computed in
// code — no LLM, no clock, no I/O. The monitor feeds this into the transition state machine.
//
// The `re-verify` outcome is one of:
//   • 'adopted' — the target the rec raised is now met.
//   • 'active'  — measurable progress toward the target, not yet met.
//   • 'stale'   — the rec's precondition no longer holds for a non-adoption reason (the
//                 signal the rec needed to be judged has vanished) → dismiss.
//   • 'none'    — still below target with no progress → leave as-is.
//
// Each predicate also returns the re-measured `after` value so the monitor can record the
// verified evidence delta on the rec (append-only, computed in code).

import type { RuleContext } from '@/lib/recommendations/types';
import {
  ACCEPTANCE,
  CACHE,
  COURSE,
  REVERT,
  SIZE_DISCIPLINE,
  SKILL_AUTHOR,
  SKILL_REUSE,
} from '@/lib/recommendations/thresholds';
import type { AdoptionSignal } from './transitions';
import type { Dimension } from '@/lib/scoring/types';

/** A predicate's verified outcome: the signal + the re-measured value it was judged on. */
export interface Verified {
  signal: AdoptionSignal;
  /** the freshly re-measured metric value (the new "before" for the recorded delta). null when no signal. */
  measured: number | null;
  /** the target the metric is compared against (for the recorded delta). */
  target: number | null;
  /** unit label matching the original rec evidence. */
  unit: string;
}

type Predicate = (ctx: RuleContext) => Verified;

// ── helpers ──────────────────────────────────────────────────────────────────

function skillReuseShare(ctx: RuleContext): { share: number | null; total: number } {
  const total = ctx.sessions.length;
  if (total < SKILL_REUSE.minSessions) return { share: null, total };
  const withSkill = ctx.sessions.filter((s) => s.skillsUsed.length > 0).length;
  return { share: withSkill / total, total };
}

function largePrShare(ctx: RuleContext): { share: number | null; merged: number } {
  const merged = ctx.prs.filter((p) => p.isMerged);
  if (merged.length < SIZE_DISCIPLINE.minMerged) return { share: null, merged: merged.length };
  const large = merged.filter((p) => p.sizeBucket === 'L').length;
  return { share: large / merged.length, merged: merged.length };
}

function cacheReadShare(ctx: RuleContext): number | null {
  let cacheRead = 0;
  let tokensIn = 0;
  for (const s of ctx.sessions) {
    cacheRead += s.cacheRead;
    tokensIn += s.tokensIn;
  }
  const total = cacheRead + tokensIn;
  if (total < CACHE.minInputTokens) return null;
  return cacheRead / total;
}

// ── predicates ───────────────────────────────────────────────────────────────

/** skill-author: adopted once the member has authored ≥1 skill. Never goes stale (the
 *  goal is durable) — absent authorship with no AI PRs is just 'none', not dismissal. */
const skillAuthor: Predicate = (ctx) => {
  const authored = ctx.authoredSkills.length;
  if (authored >= 1) return { signal: 'adopted', measured: authored, target: 1, unit: 'count' };
  const aiPrs = ctx.prs.filter((p) => p.isMerged && p.aiAssisted).length;
  // If there's no longer any AI PR activity to build a skill from, the rec is moot → stale.
  if (aiPrs < SKILL_AUTHOR.minAiPrs) return { signal: 'stale', measured: 0, target: 1, unit: 'count' };
  return { signal: 'none', measured: 0, target: 1, unit: 'count' };
};

/** skill-reuse: adopted at/above the reuse floor; active if reuse exists but below floor;
 *  stale if session volume dropped below the min (no longer measurable). */
const skillReuse: Predicate = (ctx) => {
  const { share } = skillReuseShare(ctx);
  if (share === null) return { signal: 'stale', measured: null, target: SKILL_REUSE.floor, unit: 'share' };
  if (share >= SKILL_REUSE.floor) return { signal: 'adopted', measured: share, target: SKILL_REUSE.floor, unit: 'share' };
  if (share > 0) return { signal: 'active', measured: share, target: SKILL_REUSE.floor, unit: 'share' };
  return { signal: 'none', measured: share, target: SKILL_REUSE.floor, unit: 'share' };
};

/** acceptance-rate: adopted at/above the floor; stale if the KPI lost its signal. */
const acceptanceRate: Predicate = (ctx) => {
  const kpi = ctx.kpis.suggestion_acceptance_rate;
  if (!kpi || kpi.raw === null) return { signal: 'stale', measured: null, target: ACCEPTANCE.floor, unit: 'rate' };
  if (kpi.raw >= ACCEPTANCE.floor) return { signal: 'adopted', measured: kpi.raw, target: ACCEPTANCE.floor, unit: 'rate' };
  return { signal: 'none', measured: kpi.raw, target: ACCEPTANCE.floor, unit: 'rate' };
};

/** size-discipline: adopted once the large-PR share is at/below the ceiling; stale if
 *  merged-PR volume fell below the min. */
const sizeDiscipline: Predicate = (ctx) => {
  const { share } = largePrShare(ctx);
  if (share === null) return { signal: 'stale', measured: null, target: SIZE_DISCIPLINE.lShareCeil, unit: 'share' };
  if (share <= SIZE_DISCIPLINE.lShareCeil) return { signal: 'adopted', measured: share, target: SIZE_DISCIPLINE.lShareCeil, unit: 'share' };
  return { signal: 'none', measured: share, target: SIZE_DISCIPLINE.lShareCeil, unit: 'share' };
};

/** cache-efficiency: adopted at/above the cache-read floor; stale if input volume dropped. */
const cacheEfficiency: Predicate = (ctx) => {
  const share = cacheReadShare(ctx);
  if (share === null) return { signal: 'stale', measured: null, target: CACHE.floor, unit: 'share' };
  if (share >= CACHE.floor) return { signal: 'adopted', measured: share, target: CACHE.floor, unit: 'share' };
  return { signal: 'none', measured: share, target: CACHE.floor, unit: 'share' };
};

/** revert-rate: adopted at/above the merged-without-revert floor; stale if the KPI lost signal. */
const revertRate: Predicate = (ctx) => {
  const kpi = ctx.kpis.merged_without_revert_rate;
  if (!kpi || kpi.raw === null) return { signal: 'stale', measured: null, target: REVERT.floor, unit: 'rate' };
  if (kpi.raw >= REVERT.floor) return { signal: 'adopted', measured: kpi.raw, target: REVERT.floor, unit: 'rate' };
  return { signal: 'none', measured: kpi.raw, target: REVERT.floor, unit: 'rate' };
};

/** course-nudge (ref = dimension): adopted once the assigned course for that dimension has
 *  passed its knowledge check (Prism-owned completion), OR the dimension's L2 has climbed
 *  at/above the weak threshold. Otherwise 'none'. */
const courseNudge = (ctx: RuleContext, ref: string): Verified => {
  const dim = ref as Dimension;
  const passed = ctx.courses.some((c) => c.dimension === dim && c.knowledgeCheckPassed);
  const l2 = ctx.l2[dim] ?? null;
  if (passed) return { signal: 'adopted', measured: l2, target: COURSE.weakThreshold, unit: 'score' };
  if (l2 !== null && l2 >= COURSE.weakThreshold) {
    return { signal: 'adopted', measured: l2, target: COURSE.weakThreshold, unit: 'score' };
  }
  if (l2 === null) return { signal: 'none', measured: null, target: COURSE.weakThreshold, unit: 'score' };
  return { signal: 'none', measured: l2, target: COURSE.weakThreshold, unit: 'score' };
};

// ── registry ─────────────────────────────────────────────────────────────────

const PREDICATES: Record<string, Predicate> = {
  'skill-author': skillAuthor,
  'skill-reuse': skillReuse,
  'acceptance-rate': acceptanceRate,
  'size-discipline': sizeDiscipline,
  'cache-efficiency': cacheEfficiency,
  'revert-rate': revertRate,
};

/**
 * Re-verify a single rec against fresh evidence. `detectedVia` selects the predicate;
 * `ref` is only needed by course-nudge (the dimension). Unknown detected_via → 'none'
 * (never auto-transition a rec we can't re-verify).
 */
export function verifyRec(detectedVia: string, ref: string, ctx: RuleContext): Verified {
  if (detectedVia === 'course-nudge') return courseNudge(ctx, ref);
  const p = PREDICATES[detectedVia];
  if (!p) return { signal: 'none', measured: null, target: null, unit: '' };
  return p(ctx);
}
