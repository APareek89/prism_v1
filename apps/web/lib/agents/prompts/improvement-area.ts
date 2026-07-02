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
    'For each area, in the SAME order, write a short imperative title and one or two ' +
      'grounded sentences on what to do and why. Cite the evidence ids that support each item.',
  ].join('\n');
}
