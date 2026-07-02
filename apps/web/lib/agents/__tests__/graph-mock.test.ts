// lib/agents/__tests__/graph-mock.test.ts
//
// Proves the compiled LangGraph runs KEYLESS (mock model, no network) end-to-end and
// produces grounded narrative — and that the conditional entry edge skips an
// unpublishable scope. This is the spec's "a DEMO/mock model path lets graphs run
// without calling Anthropic" guarantee, exercised through the real StateGraph.

import { describe, it, expect, beforeEach } from 'vitest';
import { scopeGraph, prLevelGraph, scopeIsNarratable, __resetGraphs } from '../graph';
import { InsightState, type InsightStateType } from '../state';
import {
  buildAllowedNumbers,
  checkGrounding,
  evidenceIdSet,
} from '../grounding';
import {
  EVIDENCE,
  USAGE_AREA,
  EFFECTIVENESS_STRENGTH,
  EFFICIENCY_DELTA,
  PR_RECORD_REVERT,
  PR_EVIDENCE,
} from './fixtures';

// The graph reads shouldUseRealModel() → false here because DEMO_MODE defaults true and no
// ANTHROPIC key is set in the test env, so every node takes the mock path.

function baseState(over: Partial<InsightStateType>): InsightStateType {
  return {
    scope: 'employee',
    scopeId: 'emp-1',
    date: '2026-06-29',
    configVersion: 'v1',
    l1: 42,
    l2: { usage: 40, efficiency: 54, effectiveness: 88, proficiency: 30 },
    band: 'L2',
    confidence: 0.55,
    confidenceBand: 'medium',
    valuesVsAnchor: [USAGE_AREA, EFFECTIVENESS_STRENGTH],
    deltas: [EFFICIENCY_DELTA],
    evidence: EVIDENCE,
    prRecords: [],
    tokensPerPr: null,
    insights: [],
    drivers: [],
    prLevel: [],
    ...over,
  };
}

describe('scopeGraph (keyless / mock)', () => {
  beforeEach(() => __resetGraphs());

  it('runs the full chain and emits improvement + change + attribution insights', async () => {
    const out = (await scopeGraph().invoke(baseState({}))) as InsightStateType;
    const kinds = new Set(out.insights.map((i) => i.kind));
    expect(kinds.has('improvement_area')).toBe(true);
    expect(kinds.has('change_governance')).toBe(true);
    expect(kinds.has('improvement_attribution')).toBe(true);
    expect(out.drivers.length).toBeGreaterThan(0);
  });

  it('every emitted insight is grounding-clean', async () => {
    const out = (await scopeGraph().invoke(baseState({}))) as InsightStateType;
    const allowed = buildAllowedNumbers(EVIDENCE, [
      USAGE_AREA.norm,
      USAGE_AREA.target,
      EFFECTIVENESS_STRENGTH.norm,
      EFFICIENCY_DELTA.delta,
      EFFICIENCY_DELTA.latest,
      EFFICIENCY_DELTA.baseline,
    ]);
    const ids = evidenceIdSet(EVIDENCE);
    for (const ins of out.insights) {
      const r = checkGrounding([ins.title, ins.body], ins.evidenceRefs, allowed, ids);
      expect(r.ok, `${ins.kind}: ${JSON.stringify(r.violations)}`).toBe(true);
    }
  });

  it('SKIPS the whole chain for an unpublishable scope (confidence below floor)', async () => {
    const suppressed = baseState({ confidence: 0.2, confidenceBand: 'insufficient' });
    expect(scopeIsNarratable(suppressed)).toBe(false);
    const out = (await scopeGraph().invoke(suppressed)) as InsightStateType;
    expect(out.insights).toHaveLength(0);
    expect(out.drivers).toHaveLength(0);
  });

  it('SKIPS when there is no evidence to cite', async () => {
    const noEvidence = baseState({ evidence: [] });
    expect(scopeIsNarratable(noEvidence)).toBe(false);
    const out = (await scopeGraph().invoke(noEvidence)) as InsightStateType;
    expect(out.insights).toHaveLength(0);
  });
});

describe('prLevelGraph (keyless / mock)', () => {
  beforeEach(() => __resetGraphs());

  it('narrates each PR with the code-decided verdict (never the model)', async () => {
    const state = baseState({
      scope: 'function',
      scopeId: 'fn-1',
      prRecords: [PR_RECORD_REVERT],
      evidence: PR_EVIDENCE,
      valuesVsAnchor: [],
      deltas: [],
    });
    const out = (await prLevelGraph().invoke(state)) as InsightStateType;
    expect(out.prLevel).toHaveLength(1);
    expect(out.prLevel[0]!.verdict).toBe('revert'); // straight from classifyPr, unchanged
    expect(out.prLevel[0]!.reason.length).toBeGreaterThan(0);
    expect(out.prLevel[0]!.fix.length).toBeGreaterThan(0);
  });

  it('skips when there are no PRs', async () => {
    const state = baseState({ prRecords: [], evidence: [] });
    const out = (await prLevelGraph().invoke(state)) as InsightStateType;
    expect(out.prLevel).toHaveLength(0);
  });
});

// Reference the InsightState export so the annotation module is covered by the run.
describe('InsightState annotation', () => {
  it('is defined', () => {
    expect(InsightState).toBeDefined();
  });
});
