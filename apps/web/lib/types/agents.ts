// lib/types/agents.ts
//
// Agent (LangGraph) narrative CONTRACTS. The numeric fields are deliberately ABSENT
// from agent OUTPUT shapes — agents narrate provided numbers and cite evidenceRefs;
// they never return a score (architecture §0.3, §6). These are app-layer types only;
// the runtime graph lives in lib/agents (M4) and is keyless until then.

import type { Dimension, Scope } from './db';

/** The four agent node kinds. */
export type AgentKind =
  | 'improvement_area'
  | 'change_governance'
  | 'pr_level'
  | 'improvement_attribution';

/** PR-level classification — decided in CODE (classifyPr), not by the LLM. */
export type PrVerdict = 're_prompt' | 'revert' | 'ai_slop' | 'clean';

/** A narrative insight emitted by an agent. NO raw numeric score field — est_impact
 *  is computed deterministically and passed in, the agent only narrates it. */
export interface AgentInsight {
  kind: AgentKind;
  title: string;
  body: string;
  dimension: Dimension | null;
  /** ids into the provided evidence set (grounding gate validates every one). */
  evidenceRefs: string[];
}

/** A change-governance driver entry (▲/▼ "what moved the index"). */
export interface ChangeDriver {
  dimension: Dimension;
  direction: 'up' | 'down';
  title: string;
  body: string;
  evidenceRefs: string[];
}

/** A PR-level verdict + narrative (verdict from code; reason/fix from LLM). */
export interface PrLevelResult {
  prId: string;
  verdict: PrVerdict;
  reason: string;
  fix: string;
  evidenceRefs: string[];
}

/** A piece of evidence the agent may cite. Read-only; agents never do arithmetic. */
export interface EvidenceRow {
  id: string;
  label: string;
  value: number | string;
}

/** Scope context an agent run is bound to. */
export interface AgentScope {
  scope: Scope;
  scopeId: string;
  date: string;
  configVersion: string;
}

/** Recommendation candidate the pipeline computes; agents import this to narrate the
 *  rationale only (the deterministic rec/adoption logic owns the rest). */
export interface RecommendationCandidate {
  employeeId: string;
  kind: string;
  ref: string;
  dimension: Dimension | null;
  evidence: Record<string, unknown>;
}
