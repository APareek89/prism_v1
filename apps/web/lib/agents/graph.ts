// lib/agents/graph.ts
//
// The StateGraph wiring. Two graphs:
//
//   scopeGraph:   bounded fan-out to improvement-area, change-governance, and
//                 improvement-attribution over one immutable evidence state.
//                 A conditional entry edge SKIPS the whole chain when the scope has no
//                 usable signal (confidence < 0.40 OR no evidence) — an unpublishable
//                 scope produces no narrative (matches the read layer's suppressed state).
//
//   prLevelGraph: a single pr-level node (its own graph, per spec).
//
// The nodes append to the state's narrative channels; the compiled graph returns the
// final state which run.ts persists.

import { StateGraph, START, END } from '@langchain/langgraph';
import { InsightState, type InsightStateType, type InsightStateUpdate } from './state';
import { improvementAreaNode } from './nodes/improvement-area';
import { changeGovernanceNode } from './nodes/change-governance';
import { improvementAttributionNode } from './nodes/improvement-attribution';
import { prLevelNode } from './nodes/pr-level';
import { CONFIDENCE_THRESHOLDS } from '@/lib/config/constants';

/** A scope is narratable when it clears the publish floor AND has evidence to cite. */
export function scopeIsNarratable(state: InsightStateType): boolean {
  return state.confidence >= CONFIDENCE_THRESHOLDS.low && state.evidence.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// scopeGraph
// ─────────────────────────────────────────────────────────────────────────────

let _scopeGraph: ReturnType<typeof buildScopeGraph> | null = null;

function buildScopeGraph() {
  const g = new StateGraph(InsightState)
    .addNode('fan_out', async (): Promise<InsightStateUpdate> => ({}))
    .addNode('improvement_area', improvementAreaNode)
    .addNode('change_governance', changeGovernanceNode)
    .addNode('improvement_attribution', improvementAttributionNode)
    // Conditional entry: skip the whole chain for an unpublishable scope.
    .addConditionalEdges(START, (state: InsightStateType) =>
      scopeIsNarratable(state) ? 'fan_out' : END,
    )
    // The three narration lanes read the same immutable facts and append to reducer
    // channels, so they can run as one bounded fan-out instead of serial LLM calls.
    .addEdge('fan_out', 'improvement_area')
    .addEdge('fan_out', 'change_governance')
    .addEdge('fan_out', 'improvement_attribution')
    .addEdge('improvement_area', END)
    .addEdge('change_governance', END)
    .addEdge('improvement_attribution', END);
  return g.compile();
}

/** Memoized compiled scope graph. */
export function scopeGraph() {
  if (!_scopeGraph) _scopeGraph = buildScopeGraph();
  return _scopeGraph;
}

// ─────────────────────────────────────────────────────────────────────────────
// prLevelGraph (separate)
// ─────────────────────────────────────────────────────────────────────────────

let _prLevelGraph: ReturnType<typeof buildPrLevelGraph> | null = null;

function buildPrLevelGraph() {
  const g = new StateGraph(InsightState)
    .addNode('pr_level', prLevelNode)
    .addConditionalEdges(START, (state: InsightStateType) =>
      state.prRecords.length > 0 ? 'pr_level' : END,
    )
    .addEdge('pr_level', END);
  return g.compile();
}

/** Memoized compiled pr-level graph. */
export function prLevelGraph() {
  if (!_prLevelGraph) _prLevelGraph = buildPrLevelGraph();
  return _prLevelGraph;
}

/** Reset compiled graphs (tests). */
export function __resetGraphs(): void {
  _scopeGraph = null;
  _prLevelGraph = null;
}
