// lib/agents/prompts/improvement-attribution.ts
//
// The user prompt for the improvement-attribution node: "what's going well — and why."
// The strengths (KPIs at/above target) are selected in code; the model attributes each
// win to a cause, grounded in the evidence. Feeds the member-detail "going well" panel.

import type { InsightStateType, ValueVsAnchor } from '../state';
import { scopeHeader, evidenceBlock, anchorTable } from './render';

export function improvementAttributionPrompt(
  state: InsightStateType,
  strengths: ValueVsAnchor[],
): string {
  return [
    scopeHeader(state),
    '',
    'The scoring engine flagged these KPIs as genuine strengths (at or above their anchor ' +
      'target), strongest first. Narrate each as a win with its likely cause. Do NOT state ' +
      'the scores as new claims — attribute the strength and cite the evidence.',
    '',
    anchorTable(strengths),
    '',
    evidenceBlock(state.evidence),
    '',
    'For each strength, in the SAME order, write a short headline and one grounded sentence ' +
      'attributing the win to a cause. Cite the supporting evidence ids.',
  ].join('\n');
}
