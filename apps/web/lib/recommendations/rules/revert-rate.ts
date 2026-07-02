// lib/recommendations/rules/revert-rate.ts
//
// PROCESS rec — "add a review/verification gate to cut reverts".
//
// Grounding: reads the persisted `merged_without_revert_rate` KPI (raw 0–1) the scoring
// engine wrote to kpi_daily — narrating its output. The engine's cold-start anchor floors
// this at 0.80 (index-config.default.ts). When a member's raw rate is below that floor AND
// there is AI-merged-PR signal, we suggest a verification-before-merge process. before =
// raw rate, after = floor, delta = the gap. Effectiveness dimension.

import type { Rule } from '../types';
import { REVERT } from '../thresholds';

/** Mirrors the scoring engine's cold-start floor for merged_without_revert_rate. */
const REVERT_FLOOR = REVERT.floor;

export const revertRateRule: Rule = (ctx) => {
  const kpi = ctx.kpis.merged_without_revert_rate;
  if (!kpi || kpi.raw === null) return null; // no AI-merged-PR signal
  if (kpi.raw >= REVERT_FLOOR) return null; // reverts already rare

  // Count the reverted AI PRs in-window for a concrete rationale (real rows).
  const revertedAiPrs = ctx.prs.filter((p) => p.isMerged && p.aiAssisted && p.reverted).length;
  const delta = Number((REVERT_FLOOR - kpi.raw).toFixed(3));
  return {
    kind: 'process',
    ref: 'verify-before-merge',
    rationale:
      `Your merged-without-revert rate is ${pct(kpi.raw)}, below the ${pct(REVERT_FLOOR)} floor` +
      (revertedAiPrs > 0 ? ` (${revertedAiPrs} AI PRs reverted this window)` : '') +
      `. Add a verification step before merge — run the change and confirm behaviour to cut reverts.`,
    detectedVia: 'revert-rate',
    dimension: 'effectiveness',
    evidence: {
      metric: 'merged_without_revert_rate',
      before: Number(kpi.raw.toFixed(3)),
      after: REVERT_FLOOR,
      delta,
      unit: 'rate',
      signals: revertedAiPrs,
    },
  };
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
