// lib/recommendations/rules/acceptance-rate.ts
//
// SKILL rec — "tighten prompts to raise suggestion acceptance".
//
// Grounding: reads the persisted `suggestion_acceptance_rate` KPI (raw_value 0–1) the
// scoring engine already wrote to kpi_daily — narrating its output, not recomputing it.
// The engine's own cold-start anchor floors this KPI at 0.40 (index-config.default.ts).
// When the member's raw acceptance is below that floor AND the KPI has signal (offered
// suggestions), we suggest a prompting-technique skill. before = raw rate, after = floor,
// delta = the gap.

import type { Rule } from '../types';
import { ACCEPTANCE } from '../thresholds';

/** Mirrors the scoring engine's cold-start floor for suggestion_acceptance_rate. */
const ACCEPTANCE_FLOOR = ACCEPTANCE.floor;

export const acceptanceRateRule: Rule = (ctx) => {
  const kpi = ctx.kpis.suggestion_acceptance_rate;
  if (!kpi || kpi.raw === null) return null; // no offered-suggestions signal
  if (kpi.raw >= ACCEPTANCE_FLOOR) return null; // already at/above the floor

  const delta = Number((ACCEPTANCE_FLOOR - kpi.raw).toFixed(3));
  return {
    kind: 'skill',
    ref: 'prompting-technique',
    rationale:
      `Your suggestion-acceptance rate is ${pct(kpi.raw)}, below the ${pct(ACCEPTANCE_FLOOR)} ` +
      `floor. Adopt a tighter prompting pattern — scoping the task and constraints up front ` +
      `raises the share of suggestions you keep.`,
    detectedVia: 'acceptance-rate',
    dimension: 'efficiency',
    evidence: {
      metric: 'suggestion_acceptance_rate',
      before: Number(kpi.raw.toFixed(3)),
      after: ACCEPTANCE_FLOOR,
      delta,
      unit: 'rate',
      signals: kpi.norm === null ? 0 : 1,
    },
  };
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
