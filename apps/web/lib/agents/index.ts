// lib/agents/index.ts
//
// The agent-layer barrel. Public surface for the pipeline / inngest / route callers:
// the two run entry points. Everything else (state, graph, nodes, grounding) is
// internal to the module and imported directly by tests.

export { runInsightsForScope, runPrLevel } from './run';
export type { AgentRunResult } from './run';

// Deterministic building blocks other M4 subsystems may reuse (read-only, pure).
export { classifyPr, REPROMPT_ITERATION_THRESHOLD } from './nodes/pr-classify';
export type { PrClassifierInput } from './nodes/pr-classify';
