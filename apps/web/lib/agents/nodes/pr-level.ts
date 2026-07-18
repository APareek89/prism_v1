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
import { PrLevelBatchNarrativeSchema, type PrLevelBatchNarrative } from '../schemas';
import { prLevelBatchPrompt } from '../prompts/pr-level';
import { SYSTEM_PROMPT } from '../prompts/system';
import { structured, narrator, shouldUseRealModel } from '../model';
import { mockPrLevel } from '../mock-model';
import { buildAllowedNumbers, checkGrounding, evidenceIdSet } from '../grounding';
import type { NarrativeValidationTrace } from '@/lib/types/agents';

export async function prLevelNode(state: InsightStateType): Promise<InsightStateUpdate> {
  const prs = state.prRecords;
  if (prs.length === 0) return { prLevel: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, PrLevelBatchNarrativeSchema, 'pr_level_batch')
    : null;

  const prLevel: PrLevelResult[] = [];
  const first: PrLevelBatchNarrative = runner
    ? await runner.invoke(SYSTEM_PROMPT, prLevelBatchPrompt(state, prs))
    : { items: prs.map((pr) => ({ prId: pr.prId, ...mockPrLevel(pr, state.evidence) })) };
  const firstChecks = new Map(prs.map((pr) => [pr.prId, validateItem(pr, first, state)]));
  const invalid = prs.filter((pr) => !firstChecks.get(pr.prId)?.ok);
  const repairDetail = invalid.map((pr) => `${pr.prId}: ${(firstChecks.get(pr.prId)?.violations ?? ['missing item']).join('; ')}`).join('\n');
  const repaired: PrLevelBatchNarrative | null = invalid.length && runner
    ? await runner.invoke(SYSTEM_PROMPT, prLevelBatchPrompt(state, invalid, repairDetail))
    : null;

  for (const pr of prs) {
    const firstCheck = firstChecks.get(pr.prId)!;
    const repairedCheck = repaired ? validateItem(pr, repaired, state) : null;
    const accepted = firstCheck.ok ? firstCheck.item : repairedCheck?.ok ? repairedCheck.item : null;
    const narrativeSource = accepted ? 'model' : 'deterministic_fallback';
    const validation: NarrativeValidationTrace = {
      attempts: repaired ? 2 : 1,
      repaired: !firstCheck.ok && Boolean(repairedCheck?.ok),
      status: 'accepted',
      rejectedClaims: firstCheck.ok
        ? []
        : [...firstCheck.violations, ...(repairedCheck && !repairedCheck.ok ? repairedCheck.violations : [])],
    };
    // A deterministic fallback preserves the code verdict even if the bounded narrator
    // omits or repeatedly fails one item. Failed prose is never persisted.
    const narrative = accepted ?? fallbackNarration(pr);
    prLevel.push({
      prId: pr.prId,
      verdict: pr.verdict, // from code — never the model
      reason: narrative.reason,
      fix: narrative.fix,
      evidenceRefs: narrative.evidenceRefs,
      narrativeSource,
      validation,
    });
  }

  return { prLevel };
}

function validateItem(pr: PrRecord, batch: PrLevelBatchNarrative, state: InsightStateType): { ok: boolean; item: PrLevelBatchNarrative['items'][number] | null; violations: string[] } {
  const item = batch.items.find((candidate) => candidate.prId === pr.prId) ?? null;
  if (!item) return { ok: false, item: null, violations: ['missing narrative for exact PR id'] };
  const evidence = state.evidence.filter((row) => row.id.includes(pr.prId) || row.id.includes(pr.ref));
  const result = checkGrounding(
    [item.reason, item.fix],
    item.evidenceRefs,
    buildAllowedNumbers(evidence, [pr.aiIterations]),
    evidenceIdSet(evidence),
  );
  return { ok: result.ok, item, violations: result.violations.map((violation) => violation.detail) };
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
