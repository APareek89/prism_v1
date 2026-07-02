// lib/agents/nodes/change-governance.ts
//
// The change-governance node: "what moved the index." The deltas (direction + signed
// amount) are computed in code (assemble.computeDeltas, already on state.deltas) — the
// LLM only narrates each movement, grounded and evidence-cited.
//
// Emits ChangeDriver[] (with direction from code) into the `drivers` channel AND an
// AgentInsight[] with kind 'change_governance' so run.ts can persist the 'change'
// insight rows the getDrivers read layer consumes. est_impact (the delta) is carried by
// run.ts, never by the LLM.

import type { InsightStateType, InsightStateUpdate } from '../state';
import type { AgentInsight, ChangeDriver } from '@/lib/types/agents';
import { ChangeGovernanceSchema } from '../schemas';
import { changeGovernancePrompt } from '../prompts/change-governance';
import { SYSTEM_PROMPT } from '../prompts/system';
import { structured, narrator, shouldUseRealModel } from '../model';
import { mockChangeGovernance } from '../mock-model';
import { groundedProduce } from './ground-run';

export async function changeGovernanceNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const deltas = state.deltas;
  if (deltas.length === 0) return { drivers: [], insights: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, ChangeGovernanceSchema, 'change_governance')
    : null;

  const drivers: ChangeDriver[] = [];
  const insights: AgentInsight[] = [];
  const extraNumbers = deltas.flatMap((d) => [d.latest, d.baseline, d.delta]);

  for (const d of deltas) {
    const single = [d];
    const produced = await groundedProduce(
      async (note) => {
        if (runner) {
          const prompt = note
            ? `${changeGovernancePrompt(state, single)}\n\n${note}`
            : changeGovernancePrompt(state, single);
          const out = await runner.invoke(SYSTEM_PROMPT, prompt);
          return out.drivers[0] ?? mockChangeGovernance(single, state.evidence).drivers[0]!;
        }
        return mockChangeGovernance(single, state.evidence).drivers[0]!;
      },
      (item) => ({ prose: [item.title, item.body], evidenceRefs: item.evidenceRefs }),
      state.evidence,
      extraNumbers,
    );

    if (produced) {
      const dimension = d.dimension ?? 'usage';
      drivers.push({
        dimension,
        direction: d.direction === 'flat' ? 'up' : d.direction,
        title: produced.title,
        body: produced.body,
        evidenceRefs: produced.evidenceRefs,
      });
      insights.push({
        kind: 'change_governance',
        title: produced.title,
        body: produced.body,
        dimension: d.dimension,
        evidenceRefs: produced.evidenceRefs,
      });
    }
  }

  return { drivers, insights };
}
