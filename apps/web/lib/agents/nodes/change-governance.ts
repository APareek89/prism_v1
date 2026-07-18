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
import { groundedBatchProduce } from './ground-run';

export async function changeGovernanceNode(
  state: InsightStateType,
): Promise<InsightStateUpdate> {
  const deltas = state.deltas;
  if (deltas.length === 0) return { drivers: [], insights: [] };

  const runner = shouldUseRealModel()
    ? structured(narrator, ChangeGovernanceSchema, 'change_governance')
    : null;

  const extraNumbers = deltas.flatMap((d) => [d.latest, d.baseline, d.delta]);
  const produced = await groundedBatchProduce(
    deltas.length,
    async (note, indexes) => {
      const selected = indexes.map((index) => deltas[index]!);
      if (!runner) return mockChangeGovernance(selected, state.evidence).drivers;
      const prompt = note
        ? `${changeGovernancePrompt(state, selected)}\n\n${note}`
        : changeGovernancePrompt(state, selected);
      const drivers = (await runner.invoke(SYSTEM_PROMPT, prompt)).drivers;
      return selected.map((delta) => drivers.find((item) => item.candidateId === delta.key));
    },
    (item) => ({
      prose: [item.title, item.observation, item.interpretation, item.alternativeExplanation, item.action, item.expectedSignal, item.verificationPlan, item.doNoHarm],
      evidenceRefs: item.evidenceRefs,
    }),
    state.evidence,
    extraNumbers,
  );

  const drivers: ChangeDriver[] = [];
  const insights: AgentInsight[] = [];
  produced.forEach((result, index) => {
    if (!result) return;
    const item = result.item;
    const delta = deltas[index]!;
    const dimension = delta.dimension ?? 'usage';
    drivers.push({
      dimension,
      direction: delta.direction === 'flat' ? 'up' : delta.direction,
      title: item.title,
      body: `${item.observation} ${item.interpretation}`,
      evidenceRefs: item.evidenceRefs,
    });
    insights.push({
      kind: 'change_governance',
      candidateId: item.candidateId,
      title: item.title,
      body: `${item.observation} ${item.interpretation}`,
      dimension: delta.dimension,
      evidenceRefs: item.evidenceRefs,
      analysis: item,
      validation: result.validation,
    });
  });

  return { drivers, insights };
}
