// lib/agents/prompts/change-governance.ts
//
// The user prompt for the change-governance node: "what moved the index." The deltas
// (direction + amount) are computed in code; the model writes the one-line reason for
// each in the order given.

import type { InsightStateType, DeltaRow } from '../state';
import { scopeHeader, evidenceBlock, deltaTable } from './render';

export function changeGovernancePrompt(state: InsightStateType, deltas: DeltaRow[]): string {
  return [
    scopeHeader(state),
    '',
    'These are the movements the scoring engine measured between the baseline window and ' +
      'the latest run (direction and amount are already computed). Narrate each in the SAME ' +
      'order. Do NOT restate the delta number as a new claim — describe the movement ' +
      'qualitatively and cite the evidence.',
    '',
    deltaTable(deltas),
    '',
    evidenceBlock(state.evidence),
    '',
    'For each movement, return its exact movement key as candidateId, a factual observation, cautious interpretation, one plausible ' +
      'alternative explanation, one controllable action, the expected leading signal, a ' +
      'verification plan, and a do-no-harm guardrail. Never turn correlation into causation. ' +
      'For an organization scope, never identify or imply an individual. Cite exact evidence ids.',
  ].join('\n');
}
