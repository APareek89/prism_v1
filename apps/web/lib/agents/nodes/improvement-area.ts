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
import { groundedProduce } from './ground-run';

export async function improvementAreaNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const ranked = rankImprovements(state.valuesVsAnchor);
  if (ranked.length === 0) return { insights: [] };

  const areas = ranked.map((r) => r.area);
  const runner = shouldUseRealModel()
    ? structured(narrator, ImprovementAreaSchema, 'improvement_area')
    : null;

  const insights: AgentInsight[] = [];

  // Numbers the model is additionally allowed to quote: each area's normalized score.
  const extraNumbers = areas.flatMap((a) => [a.norm, a.target]);

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i]!;
    const single = [area];

    const produced = await groundedProduce(
      async (note) => {
        if (runner) {
          const prompt = note
            ? `${improvementAreaPrompt(state, single)}\n\n${note}`
            : improvementAreaPrompt(state, single);
          const out = await runner.invoke(SYSTEM_PROMPT, prompt);
          return out.items[0] ?? mockImprovementArea(single, state.evidence).items[0]!;
        }
        return mockImprovementArea(single, state.evidence).items[0]!;
      },
      (item) => ({ prose: [item.title, item.body], evidenceRefs: item.evidenceRefs }),
      state.evidence,
      extraNumbers,
    );

    if (produced) {
      insights.push({
        kind: 'improvement_area',
        title: produced.title,
        body: produced.body,
        dimension: area.dimension,
        evidenceRefs: produced.evidenceRefs,
      });
    }
  }

  return { insights };
}
