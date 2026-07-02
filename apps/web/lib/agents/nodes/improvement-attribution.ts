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
import { groundedProduce } from './ground-run';

export async function improvementAttributionNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const strengths = rankStrengths(state.valuesVsAnchor);
  if (strengths.length === 0) return { insights: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, ImprovementAttributionSchema, 'improvement_attribution')
    : null;

  const insights: AgentInsight[] = [];
  const extraNumbers = strengths.flatMap((s) => [s.norm, s.target]);

  for (const s of strengths) {
    const single = [s];
    const produced = await groundedProduce(
      async (note) => {
        if (runner) {
          const prompt = note
            ? `${improvementAttributionPrompt(state, single)}\n\n${note}`
            : improvementAttributionPrompt(state, single);
          const out = await runner.invoke(SYSTEM_PROMPT, prompt);
          return (
            out.items[0] ?? mockImprovementAttribution(single, state.evidence).items[0]!
          );
        }
        return mockImprovementAttribution(single, state.evidence).items[0]!;
      },
      (item) => ({ prose: [item.title, item.body], evidenceRefs: item.evidenceRefs }),
      state.evidence,
      extraNumbers,
    );

    if (produced) {
      insights.push({
        kind: 'improvement_attribution',
        title: produced.title,
        body: produced.body,
        dimension: s.dimension,
        evidenceRefs: produced.evidenceRefs,
      });
    }
  }

  return { insights };
}
