// lib/recommendations/rules/size-discipline.ts
//
// PROCESS rec — "break large PRs into smaller ones".
//
// Grounding: large PRs slow review and inflate iteration cost. We measure the SHARE of
// merged PRs bucketed 'L' (frozen tertiles set by scoring/sizing — we only READ the
// bucket, never re-bucket). When the L-share is above the discipline ceiling and there is
// real merged-PR volume, we suggest smaller PRs. before = L-share, after = ceiling,
// delta = the excess. Size is never rewarded; this rec is purely a process nudge.

import type { Rule } from '../types';
import { SIZE_DISCIPLINE } from '../thresholds';

const MIN_MERGED = SIZE_DISCIPLINE.minMerged;
const L_SHARE_CEIL = SIZE_DISCIPLINE.lShareCeil;

export const sizeDisciplineRule: Rule = (ctx) => {
  const merged = ctx.prs.filter((p) => p.isMerged);
  if (merged.length < MIN_MERGED) return null;

  const large = merged.filter((p) => p.sizeBucket === 'L').length;
  const share = large / merged.length;
  if (share <= L_SHARE_CEIL) return null;

  const delta = Number((share - L_SHARE_CEIL).toFixed(3));
  return {
    kind: 'process',
    ref: 'size-discipline',
    rationale:
      `${large} of ${merged.length} merged PRs were large (${pct(share)}). Split large ` +
      `changes into reviewable slices — smaller PRs merge faster and iterate less.`,
    detectedVia: 'size-discipline',
    dimension: 'efficiency',
    evidence: {
      metric: 'large_pr_share',
      before: Number(share.toFixed(3)),
      after: L_SHARE_CEIL,
      delta,
      unit: 'share',
      signals: merged.length,
    },
  };
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
