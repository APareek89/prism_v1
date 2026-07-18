// lib/agents/nodes/improvement-area.ts
//
// The improvement-area node: narrate the KPIs furthest below their anchor targets. The
// RANKING and the est_impact are computed in code (assemble.rankImprovements, a pure
// function re-applied here over the state's valuesVsAnchor) — the LLM only writes the
// title + body for each ranked area, grounded and evidence-cited.
//
// Emits AgentInsight[] with kind 'improvement_area'. rank/est_impact are carried on the
// side (see run.ts) and are NOT part of the LLM output.

import type { InsightStateType, InsightStateUpdate } from '../state';
import type { AgentInsight } from '@/lib/types/agents';
import { rankImprovements } from '../assemble';
import { ImprovementAreaSchema } from '../schemas';
import { improvementAreaPrompt } from '../prompts/improvement-area';
import { SYSTEM_PROMPT } from '../prompts/system';
import { structured, narrator, shouldUseRealModel } from '../model';
import { mockImprovementArea } from '../mock-model';
import { groundedBatchProduce } from './ground-run';

export async function improvementAreaNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const ranked = rankImprovements(state.valuesVsAnchor, state.scope === 'function' ? 3 : 5);
  if (ranked.length === 0) return { insights: [] };

  const areas = ranked.map((r) => r.area);
  const runner = shouldUseRealModel()
    ? structured(narrator, ImprovementAreaSchema, 'improvement_area')
    : null;

  // Numbers the model is additionally allowed to quote: each area's normalized score.
  const extraNumbers = areas.flatMap((a) => [a.norm, a.target]);
  const produced = await groundedBatchProduce(
    areas.length,
    async (note, indexes) => {
      const selected = indexes.map((index) => areas[index]!);
      if (!runner) return mockImprovementArea(selected, state.evidence).items;
      const prompt = note
        ? `${improvementAreaPrompt(state, selected)}\n\n${note}`
        : improvementAreaPrompt(state, selected);
      const items = (await runner.invoke(SYSTEM_PROMPT, prompt)).items;
      return selected.map((area) => items.find((item) => item.candidateId === area.kpiId));
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
      kind: 'improvement_area',
      candidateId: item.candidateId,
      title: item.title,
      body: `${item.observation} ${item.interpretation}`,
      dimension: areas[index]!.dimension,
      evidenceRefs: item.evidenceRefs,
      analysis: item,
      validation: result.validation,
    }];
  });

  return { insights };
}
