// lib/agents/prompts/improvement-area.ts
//
// The user prompt for the improvement-area node: "given the KPIs furthest below their
// anchor targets (already selected & ranked in code), write the improvement narrative
// for each." The model receives the ranked areas and narrates them; it never picks the
// ranking or states the impact number.

import type { InsightStateType, ValueVsAnchor } from '../state';
import { scopeHeader, evidenceBlock, anchorTable } from './render';

export function improvementAreaPrompt(
  state: InsightStateType,
  rankedAreas: ValueVsAnchor[],
): string {
  return [
    scopeHeader(state),
    '',
    'The scoring engine identified these KPIs as the biggest opportunities to improve, ' +
      'ordered by modeled impact (highest first). Do NOT re-order them and do NOT state ' +
      'any impact number — that is computed separately.',
    '',
    anchorTable(rankedAreas),
    '',
    evidenceBlock(state.evidence),
    '',
    'For each area, return its exact KPI id as candidateId and the complete coaching contract: a factual ' +
      'observation, cautious interpretation, one plausible alternative explanation, one ' +
      'controllable action, the expected leading signal, a verification plan for a later ' +
      'measured window, and a do-no-harm guardrail. Do not claim causality. For an ' +
      'organization scope, never identify or imply an individual. Cite exact evidence ids.',
  ].join('\n');
}
