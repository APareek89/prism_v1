// lib/agents/nodes/pr-level.ts
//
// The pr-level node. The VERDICT for each PR is already decided in code
// (assemble → classifyPr → pr.verdict); this node only asks the LLM to write the reason
// + fix for each, grounded in that PR's signals. Emits PrLevelResult[] into `prLevel`.
//
// The verdict is NEVER touched by the model — it flows straight from the classifier onto
// the result. reason/fix are the only LLM-authored fields.

import type { InsightStateType, InsightStateUpdate, PrRecord } from '../state';
import type { PrLevelResult } from '@/lib/types/agents';
import { PrLevelNarrativeSchema } from '../schemas';
import { prLevelPrompt } from '../prompts/pr-level';
import { SYSTEM_PROMPT } from '../prompts/system';
import { structured, narrator, shouldUseRealModel } from '../model';
import { mockPrLevel } from '../mock-model';
import { groundedProduce } from './ground-run';

export async function prLevelNode(state: InsightStateType): Promise<InsightStateUpdate> {
  const prs = state.prRecords;
  if (prs.length === 0) return { prLevel: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, PrLevelNarrativeSchema, 'pr_level')
    : null;

  const prLevel: PrLevelResult[] = [];

  for (const pr of prs) {
    const perPrEvidence = state.evidence.filter(
      (e) => e.id.includes(pr.prId) || e.id.includes(pr.ref),
    );
    const extraNumbers = [pr.aiIterations];

    const produced = await groundedProduce(
      async (note) => {
        if (runner) {
          const prompt = note ? `${prLevelPrompt(state, pr)}\n\n${note}` : prLevelPrompt(state, pr);
          return runner.invoke(SYSTEM_PROMPT, prompt);
        }
        return mockPrLevel(pr, state.evidence);
      },
      (item) => ({ prose: [item.reason, item.fix], evidenceRefs: item.evidenceRefs }),
      perPrEvidence,
      extraNumbers,
    );

    // Even if narration is dropped by the gate, the verdict itself is a real code fact —
    // fall back to a minimal, number-free narration so the PR-level insight still lands.
    const narrative = produced ?? fallbackNarration(pr);
    prLevel.push({
      prId: pr.prId,
      verdict: pr.verdict, // from code — never the model
      reason: narrative.reason,
      fix: narrative.fix,
      evidenceRefs: narrative.evidenceRefs,
    });
  }

  return { prLevel };
}

/** Number-free, always-grounded fallback (used only if both LLM attempts are dropped). */
function fallbackNarration(pr: PrRecord): { reason: string; fix: string; evidenceRefs: string[] } {
  const reason =
    pr.verdict === 'revert'
      ? 'This merged change was reverted shortly after landing.'
      : pr.verdict === 'ai_slop'
        ? 'This AI-majority change needed fix-type rework after merge.'
        : pr.verdict === 're_prompt'
          ? 'This change took several AI iterations before it merged.'
          : 'This change merged cleanly with no revert or rework.';
  const fix =
    pr.verdict === 'clean'
      ? 'Keep going — this is the pattern to repeat.'
      : 'Review the change against a checklist and add a covering test before re-landing.';
  return { reason, fix, evidenceRefs: [] };
}
