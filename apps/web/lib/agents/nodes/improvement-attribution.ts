// lib/agents/nodes/improvement-attribution.ts
//
// The improvement-attribution node: "what's going well — and why." The strengths (KPIs
// at/above target) are selected in code (assemble.rankStrengths, re-applied here over
// state.valuesVsAnchor) — the LLM only attributes each win to a cause, grounded.
//
// Emits AgentInsight[] with kind 'improvement_attribution'; run.ts persists these as
// insights.kind='attribution' (the getMemberWell "going well" panel).

import type { InsightStateType, InsightStateUpdate } from '../state';
import type { AgentInsight } from '@/lib/types/agents';
import { rankStrengths } from '../assemble';
import { ImprovementAttributionSchema } from '../schemas';
import { improvementAttributionPrompt } from '../prompts/improvement-attribution';
import { SYSTEM_PROMPT } from '../prompts/system';
import { structured, narrator, shouldUseRealModel } from '../model';
import { mockImprovementAttribution } from '../mock-model';
import { groundedBatchProduce } from './ground-run';

export async function improvementAttributionNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const strengths = rankStrengths(state.valuesVsAnchor, state.scope === 'function' ? 3 : 4);
  if (strengths.length === 0) return { insights: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, ImprovementAttributionSchema, 'improvement_attribution')
    : null;

  const extraNumbers = strengths.flatMap((s) => [s.norm, s.target]);
  const produced = await groundedBatchProduce(
    strengths.length,
    async (note, indexes) => {
      const selected = indexes.map((index) => strengths[index]!);
      if (!runner) return mockImprovementAttribution(selected, state.evidence).items;
      const prompt = note
        ? `${improvementAttributionPrompt(state, selected)}\n\n${note}`
        : improvementAttributionPrompt(state, selected);
      const items = (await runner.invoke(SYSTEM_PROMPT, prompt)).items;
      return selected.map((strength) => items.find((item) => item.candidateId === strength.kpiId));
    },
    (item) => ({
      prose: [item.title, item.observation, item.interpretation, item.alternativeExplanation, item.action, item.expectedSignal, item.verificationPlan, item.doNoHarm],
      evidenceRefs: item.evidenceRefs,
    }),
    state.evidence,
    extraNumbers,
  );

  const insights: AgentInsight[] = produced.flatMap((result, index) => {
    if (!result) return [];
    const item = result.item;
    return [{
      kind: 'improvement_attribution',
      candidateId: item.candidateId,
      title: item.title,
      body: `${item.observation} ${item.interpretation}`,
      dimension: strengths[index]!.dimension,
      evidenceRefs: item.evidenceRefs,
      analysis: item,
      validation: result.validation,
    }];
  });

  return { insights };
}
