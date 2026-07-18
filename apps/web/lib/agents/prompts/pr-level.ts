// lib/agents/prompts/pr-level.ts
//
// The user prompt for the pr-level node. The VERDICT ({re-prompt|revert|ai-slop|clean})
// is decided in code (classifyPr) and passed in; the model only writes the reason and a
// concrete fix. It must not contradict the verdict or invent PR signals.

import type { InsightStateType, PrRecord } from '../state';
import { evidenceBlock, prSignals } from './render';

export function prLevelPrompt(state: InsightStateType, pr: PrRecord): string {
  return [
    `SCOPE: ${state.scope} (${state.scopeId})   DATE: ${state.date}`,
    '',
    'A PR has already been classified by the scoring engine. The verdict is FINAL. Write ' +
      'one grounded sentence explaining why this PR earned that verdict (using only the ' +
      'signals below) and one short, concrete fix for the author.',
    '',
    prSignals(pr),
    '',
    evidenceBlock(state.evidence.filter((e) => e.id.includes(pr.prId) || e.id.includes(pr.ref))),
    '',
    'Return reason + fix. Cite any evidence ids you rely on.',
  ].join('\n');
}

export function prLevelBatchPrompt(state: InsightStateType, prs: PrRecord[], repair: string | null = null): string {
  const blocks = prs.map((pr) => [
    `PR_ID: ${pr.prId}`,
    prSignals(pr),
    evidenceBlock(state.evidence.filter((e) => e.id.includes(pr.prId) || e.id.includes(pr.ref))),
  ].join('\n')).join('\n\n---\n\n');
  return [
    `SCOPE: ${state.scope} (${state.scopeId})   DATE: ${state.date}`,
    '',
    'Each PR below has already been classified by deterministic code. Every verdict is FINAL. ' +
      'Return exactly one item per PR_ID with that exact id, one grounded reason, one concrete fix, ' +
      'and only evidence ids listed inside that PR block. Do not infer a different verdict.',
    '',
    blocks,
    repair ? `\nREPAIR REQUIRED:\n${repair}` : '',
  ].join('\n');
}
